import { Router } from 'express';
import { comparePassword, generateToken, requireAuth } from '../middleware/auth';
import { getUserByEmail } from '../services/store';

const router = Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body ?? {};
  const user = getUserByEmail(email);

  if (!user || !comparePassword(password, user.passwordHash)) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const token = generateToken({
    id: user.id,
    email: user.email,
    role: user.role,
    boardingHouseId: user.boardingHouseId,
  });

  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});

router.get('/me', requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

export default router;
