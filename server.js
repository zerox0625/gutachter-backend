require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Supabase Initialisierung
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL und SUPABASE_ANON_KEY in .env fehlen!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ============ ROOT ============
app.get('/', (req, res) => {
  res.send('✅ Gutachter-API läuft mit Supabase!');
});

// ============ DEBUG ENDPOINT ============
app.get('/api/debug/env', (req, res) => {
  res.json({
    supabaseUrl: supabaseUrl ? 'SET ✅' : 'MISSING ❌',
    supabaseKey: supabaseKey ? 'SET ✅' : 'MISSING ❌',
    nodeEnv: process.env.NODE_ENV || 'not set',
    port: PORT,
    timestamp: new Date(),
    hint: 'Überprüfe Render Environment Variables unter Settings'
  });
});

// ============ AUTH - LOGIN ============
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email/Passwort fehlt' });
  }

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Falsche Anmeldedaten' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Falsche Anmeldedaten' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (e) {
    res.status(500).json({ error: 'Serverfehler: ' + e.message });
  }
});

// ============ AUTH - REGISTER ============
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, Email, Passwort erforderlich' });
  }

  try {
    // Check ob Email existiert
    const { data: exists } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (exists) {
      return res.status(400).json({ error: 'Email bereits registriert' });
    }

    // Passwort hashen
    const hash = await bcrypt.hash(password, 10);

    // Neuen User einfügen
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

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      success: true,
      message: '✅ Erfolgreich registriert',
      user: {
        id: data.id,
        name: data.name,
        email: data.email,
        role: data.role,
      },
    });
  } catch (e) {
    res.status(500).json({ error: 'Serverfehler: ' + e.message });
  }
});

// ============ USERS - GET ALL ============
app.get('/api/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id,name,email,role,is_active');

    if (error) throw error;

    res.json({ success: true, users: data });
  } catch (e) {
    res.status(500).json({ error: 'Serverfehler: ' + e.message });
  }
});

// ============ USERS - CREATE ============
app.post('/api/users', async (req, res) => {
  const { email, password, name, role } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, Passwort, Name erforderlich' });
  }

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

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      success: true,
      message: '✅ User erstellt',
      user: data,
    });
  } catch (e) {
    res.status(500).json({ error: 'Serverfehler: ' + e.message });
  }
});

// ============ USERS - DELETE ============
app.delete('/api/users/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', req.params.id);

    if (error && error.code !== 'PGRST116') {
      return res.status(404).json({ error: 'User nicht gefunden' });
    }

    res.json({ success: true, message: '✅ User gelöscht' });
  } catch (e) {
    res.status(500).json({ error: 'Serverfehler: ' + e.message });
  }
});

// ============ USERS - UPDATE ROLE ============
app.put('/api/users/:id/role', async (req, res) => {
  const { role } = req.body;

  if (!['SACHBEARBEITER', 'GUTACHTER', 'ADMIN'].includes(role)) {
    return res.status(400).json({ error: 'Ungültige Rolle' });
  }

  try {
    const { data: user } = await supabase
      .from('users')
      .select('email')
      .eq('id', req.params.id)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'User nicht gefunden' });
    }

    const { data, error } = await supabase
      .from('users')
      .update({ role })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: `✅ Rolle aktualisiert: ${role}`,
      user: data,
    });
  } catch (e) {
    res.status(500).json({ error: 'Serverfehler: ' + e.message });
  }
});

// ============ CASES - GET ALL ============
app.get('/api/cases', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cases')
      .select('*');

    if (error) throw error;

    res.json({ success: true, cases: data });
  } catch (e) {
    res.status(500).json({ error: 'Serverfehler: ' + e.message });
  }
});

// ============ CASES - CREATE ============
app.post('/api/cases', async (req, res) => {
  const { title, description, user_id, status } = req.body;

  if (!title || !user_id) {
    return res.status(400).json({ error: 'Titel und User ID erforderlich' });
  }

  try {
    const { data, error } = await supabase
      .from('cases')
      .insert([
        {
          title,
          description: description || '',
          user_id,
          status: status || 'OPEN',
          created_at: new Date(),
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: '✅ Fall erstellt',
      case: data,
    });
  } catch (e) {
    res.status(500).json({ error: 'Serverfehler: ' + e.message });
  }
});

// ============ CASES - UPDATE ============
app.put('/api/cases/:id', async (req, res) => {
  const { title, description, status } = req.body;

  try {
    const { data, error } = await supabase
      .from('cases')
      .update({
        title,
        description,
        status,
        updated_at: new Date(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: '✅ Fall aktualisiert',
      case: data,
    });
  } catch (e) {
    res.status(500).json({ error: 'Serverfehler: ' + e.message });
  }
});

// ============ CASES - DELETE ============
app.delete('/api/cases/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('cases')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ success: true, message: '✅ Fall gelöscht' });
  } catch (e) {
    res.status(500).json({ error: 'Serverfehler: ' + e.message });
  }
});

// ============ SERVER START ============
app.listen(PORT, () => {
  console.log(`✅ Server läuft auf http://localhost:${PORT}`);
  console.log(`📊 Supabase verbunden: ${supabaseUrl}`);
});
