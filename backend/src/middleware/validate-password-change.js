/** Validate types before bcrypt or database operations. Never log these values. */
export function validatePasswordChange(req, res, next) {
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof currentPassword !== 'string' || !currentPassword
    || typeof newPassword !== 'string' || newPassword.length < 8
    || Buffer.byteLength(newPassword, 'utf8') > 72) {
    return res.status(400).json({ message: 'Mot de passe actuel requis ; nouveau mot de passe de 8 caractères minimum et 72 octets maximum.' });
  }
  next();
}
