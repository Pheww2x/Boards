import { randomUUID } from 'crypto';
import { StringDecoder } from 'string_decoder';
import mongoose, { type ClientSession } from 'mongoose';
import readline from 'readline';
import { env } from '../config/env';
import { hashPassword } from '../middleware/auth';
import BoardingHouse from '../models/BoardingHouse';
import User from '../models/User';

const OWNER_EMAIL = 'owner@boardhouse.local';
const OWNER_EMAIL_MATCH = /^owner@boardhouse\.local$/i;

class ProvisioningError extends Error {}

function assertInteractiveTerminal() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new ProvisioningError('Run this script from an interactive terminal.');
  }
}

async function promptOwnerDetails() {
  const prompt = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const name = (await new Promise<string>((resolve) => {
      prompt.question('Owner name: ', resolve);
    })).trim();
    const boardingHouseId = (await new Promise<string>((resolve) => {
      prompt.question('Existing boarding house ID: ', resolve);
    })).trim();
    if (!name) throw new ProvisioningError('Owner name is required.');
    if (!boardingHouseId) throw new ProvisioningError('Boarding house ID is required.');
    return { name, boardingHouseId };
  } finally {
    prompt.close();
  }
}

function promptHidden(label: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY || !process.stdout.isTTY) {
    return Promise.reject(new ProvisioningError('Run this script from an interactive terminal.'));
  }

  return new Promise((resolve, reject) => {
    const decoder = new StringDecoder('utf8');
    let value = '';
    let escapeState = 0;
    const previousRawMode = input.isRaw;

    const cleanup = () => {
      input.off('data', onData);
      input.setRawMode(previousRawMode === true);
      input.pause();
      process.stdout.write('\n');
    };

    const onData = (chunk: Buffer) => {
      for (const character of decoder.write(chunk)) {
        if (escapeState === 1) {
          escapeState = character === '[' || character === 'O' ? 2 : 0;
          continue;
        }
        if (escapeState === 2) {
          if (character >= '@' && character <= '~') escapeState = 0;
          continue;
        }
        if (character === '\u001b') {
          escapeState = 1;
          continue;
        }
        if (character === '\u0003' || character === '\u0004') {
          cleanup();
          reject(new ProvisioningError('Provisioning cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = Array.from(value).slice(0, -1).join('');
          continue;
        }
        if (character >= ' ') value += character;
      }
    };

    process.stdout.write(label);
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

async function findOwner(session?: ClientSession) {
  let query = User.findOne({ email: OWNER_EMAIL_MATCH }).select({ id: 1 });
  if (session) query = query.session(session);
  return query.lean().exec();
}

async function findBoardingHouse(boardingHouseId: string, session?: ClientSession) {
  let query = BoardingHouse.findOne({ id: boardingHouseId }).select({ id: 1 });
  if (session) query = query.session(session);
  return query.lean().exec();
}

async function supportsTransactions() {
  const database = mongoose.connection.db;
  if (!database) throw new ProvisioningError('MongoDB is not connected.');
  const hello = await database.admin().command({ hello: 1 });
  return Boolean(hello.setName || hello.msg === 'isdbgrid' || hello.serviceId);
}

async function createOwner(
  user: {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    role: 'owner';
    boardingHouseId: string;
    createdAt: string;
  },
  useTransaction: boolean
) {
  if (!useTransaction) {
    if (await findOwner()) throw new ProvisioningError('Owner account already exists; no changes were made.');
    if (!await findBoardingHouse(user.boardingHouseId)) {
      throw new ProvisioningError('The selected boarding house no longer exists.');
    }
    await User.create(user);
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (await findOwner(session)) {
        throw new ProvisioningError('Owner account already exists; no changes were made.');
      }
      if (!await findBoardingHouse(user.boardingHouseId, session)) {
        throw new ProvisioningError('The selected boarding house no longer exists.');
      }
      await User.create([user], { session });
    });
  } finally {
    await session.endSession();
  }
}

function isDuplicateKeyError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error &&
    (error as { code?: number }).code === 11000;
}

function safeFailureHint(error: unknown) {
  const message = typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message?: unknown }).message ?? '').toLowerCase()
    : '';
  if (/bad auth|authentication failed|authentication/.test(message)) {
    return 'MongoDB rejected authentication. Verify the Atlas database username and password, and URL-encode special characters.';
  }
  if (/not authorized|unauthorized|not permitted|permission/.test(message)) {
    return 'The Atlas database user may lack permissions for this database; verify the database name and readWrite role.';
  }
  if (/timed out|server selection|econn|enotfound|network/.test(message)) {
    return "Check Atlas Network Access and ensure this machine's current public IP is allowed.";
  }
  return 'Check the Atlas database user, selected database, network access, and transaction availability.';
}

async function main() {
  let stage = 'interactive terminal validation';
  try {
    assertInteractiveTerminal();
    if (!process.env.MONGODB_URI) {
      throw new ProvisioningError('MONGODB_URI must be configured; no database connection was attempted.');
    }

    stage = 'MongoDB connection';
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });

    stage = 'checking for an existing Owner account';
    if (await findOwner()) {
      throw new ProvisioningError('Owner account already exists; no changes were made.');
    }

    stage = 'collecting the Owner name and boarding house ID';
    const { name, boardingHouseId } = await promptOwnerDetails();
    stage = 'checking the boarding house';
    if (!await findBoardingHouse(boardingHouseId)) {
      throw new ProvisioningError('No boarding house exists with that ID.');
    }

    stage = 'secure password entry';
    let password = await promptHidden('Owner password (minimum 12 characters; input hidden): ');
    const confirmation = await promptHidden('Confirm Owner password (input hidden): ');
    if (password.length < 12) {
      password = '';
      throw new ProvisioningError('Password must be at least 12 characters.');
    }
    if (password !== confirmation) {
      password = '';
      throw new ProvisioningError('Passwords do not match.');
    }

    stage = 'ensuring user uniqueness indexes';
    await User.init();
    const user = {
      id: `user-owner-${randomUUID()}`,
      name,
      email: OWNER_EMAIL,
      passwordHash: hashPassword(password),
      role: 'owner' as const,
      boardingHouseId,
      createdAt: new Date().toISOString(),
    };
    password = '';

    stage = 'checking MongoDB transaction support';
    const useTransaction = await supportsTransactions();
    stage = 'creating the Owner account';
    await createOwner(user, useTransaction);
    console.log('Owner account created successfully.');
  } catch (error) {
    if (error instanceof ProvisioningError) {
      console.error(error.message);
    } else if (isDuplicateKeyError(error)) {
      console.error('An account with this email or generated ID already exists; no existing account was modified.');
    } else {
      console.error(`Provisioning failed during ${stage}. ${safeFailureHint(error)} No credentials were printed.`);
    }
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
      } catch {
        console.error('MongoDB disconnect failed.');
        process.exitCode = 1;
      }
    }
  }
}

void main();
