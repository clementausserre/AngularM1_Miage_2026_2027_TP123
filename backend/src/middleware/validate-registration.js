// Same syntax and length limits as Angular's Validators.email.
const EMAIL = /^(?=.{1,254}$)(?=.{1,64}@)[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/** Validate before querying MongoDB or hashing; never include credentials in errors. */
export function validateRegistration(req, res, next) {
  const { name, email, password } = req.body ?? {};
  if (typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ message: 'Le nom doit contenir au moins 2 caractères, hors espaces aux extrémités.' });
  }
  if (typeof email !== 'string' || !EMAIL.test(email)) {
    return res.status(400).json({ message: 'Adresse email invalide.' });
  }
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 8 caractères et ne pas dépasser 72 octets UTF-8.' });
  }
  req.body = { name: name.trim(), email: email.toLowerCase(), password };
  next();
}
