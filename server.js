const express = require('express');
const bcrypt = require('bcrypt');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL und SUPABASE_ANON_KEY fehlen!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ROOT
app.get('/', (req, res) => {
  res.send('Gutachter-API läuft mit Supabase. /api/...');
});

// AUTH
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email/Passwort fehlt' });

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user)
      return res.status(401).json({ error: 'Falsche Anmeldedaten' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ error: 'Falsche Anmeldedaten' });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (e) {
    res.status(500).json({ error: 'Serverfehler' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Alle Felder nötig' });

  try {
    const { data: exists } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (exists)
      return res.status(400).json({ error: 'Email existiert' });

    const hash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from('users')
      .insert([
        {
          name,
          email,
          password: hash,
          role: 'SACHBEARBEITER',
          is_active: true,
        },
      ])
      .select()
      .single();

    if (error)
      return res.status(400).json({ error: error.message });

    res.json({ message: 'Erfolgreich registriert', user: data });
  } catch (e) {
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// USERS
app.get('/api/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id,name,email,role,is_active');

    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { email, password, name, role } = req.body;
  if (!email || !password || !name)
    return res.status(400).json({ error: 'Felder fehlen' });

  try {
    const hash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from('users')
      .insert([
        {
          name,
          email,
          password: hash,
          role: role || 'SACHBEARBEITER',
          is_active: true,
        },
      ])
      .select()
      .single();

    if (error)
      return res.status(400).json({ error: error.message });

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', req.params.id);

    // PGRST116 = "No rows found" bei Supabase/PostgREST
    if (error && error.code !== 'PGRST116')
      return res.status(404).json({ error: 'Nicht gefunden' });

    res.json({ message: 'Gelöscht' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/users/:id/role', async (req, res) => {
  const { role } = req.body;
  if (!['SACHBEARBEITER', 'GUTACHTER', 'ADMIN'].includes(role))
    return res.status(400).json({ error: 'Ungültige Rolle' });

  try {
    const { data: user } = await supabase
      .from('users')
      .select('email')
      .eq('id', req.params.id)
      .single();

    if (!user)
      return res.status(404).json({ error: 'Nicht gefunden' });

    // Optionaler Selbstschutz
    if (
      user.email === req.headers['x-user-email'] &&
      role !== 'ADMIN'
    ) {
      return res.status(403).json({ error: 'Selbstschutz' });
    }

    const { data, error } = await supabase
      .from('users')
      .update({ role })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: `Rolle: ${role}`, user: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// CASES (einfaches Beispiel)
app.get('/api/cases', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cases') // Tabellennamen ggf. anpassen
      .select('*');

    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SERVER START
app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
