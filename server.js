const express = require('express');
const bcrypt = require('bcrypt');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});



app.use(cors());
app.use(express.json());

// In-Memory "Datenbank"
let users = [];
let cases = [];
let clients = [];

// ============ AUTH ============

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email und Passwort erforderlich' });
    }

    const user = users.find(u => u.email === email);
    if (!user) {
        return res.status(401).json({ error: 'Email oder Passwort falsch' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
        return res.status(401).json({ error: 'Email oder Passwort falsch' });
    }

    res.json({
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role
        }
    });
});

app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Alle Felder erforderlich' });
    }

    if (users.find(u => u.email === email)) {
        return res.status(400).json({ error: 'Email existiert bereits' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
        id: users.length + 1,
        name,
        email,
        password: hashedPassword,
        role: 'SACHBEARBEITER', // neue User standardmäßig Sachbearbeiter
        isActive: true
    };

    users.push(newUser);
    res.json({ message: 'Registrierung erfolgreich' });
});

// ============ USERS (inkl. Rollen ändern) ============

app.get('/api/users', (req, res) => {
    res.json(
        users.map(u => ({
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
            isActive: u.isActive
        }))
    );
});

app.post('/api/users', async (req, res) => {
    const { email, password, name, role } = req.body;

    if (!email || !password || !name) {
        return res.status(400).json({ error: 'Alle Felder erforderlich' });
    }

    if (users.find(u => u.email === email)) {
        return res.status(400).json({ error: 'Email existiert bereits' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
        id: users.length + 1,
        name,
        email,
        password: hashedPassword,
        role: role || 'SACHBEARBEITER',
        isActive: true
    };

    users.push(newUser);
    res.json(newUser);
});

app.delete('/api/users/:id', (req, res) => {
    const index = users.findIndex(u => u.id === parseInt(req.params.id));
    if (index !== -1) {
        users.splice(index, 1);
    }
    res.json({ message: 'Gelöscht' });
});

// Rolle ändern (für Admin – Auth nur rudimentär über Header simuliert)
app.put('/api/users/:id/role', (req, res) => {
    const userId = parseInt(req.params.id);
    const { role } = req.body;

    const validRoles = ['SACHBEARBEITER', 'GUTACHTER', 'ADMIN'];
    if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Ungültige Rolle' });
    }

    const user = users.find(u => u.id === userId);
    if (!user) {
        return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    const currentUserEmail = req.headers['x-user-email'] || 'unknown';
    if (user.email === currentUserEmail && role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin kann sich selbst nicht degradieren' });
    }

    user.role = role;
    res.json({
        message: `Rolle geändert zu ${role}`,
        user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
});

// ============ CASES (Auftragsbogen) ============

app.get('/api/cases', (req, res) => {
    res.json(cases);
});

app.post('/api/cases', (req, res) => {
    const {
        description,
        inspectorId,
        clientId,
        priority,
        aktenzeichen,
        auftragsdatum,
        frist,
        ort,
        interneNotiz
    } = req.body;

    if (!description || !inspectorId) {
        return res.status(400).json({ error: 'Beschreibung und Gutachter sind erforderlich' });
    }

    const newCase = {
        id: cases.length + 1,
        autoNr: `CASE-${String(cases.length + 1).padStart(5, '0')}`,
        description,
        inspectorId,
        clientId,
        priority: priority || 'MEDIUM',
        status: 'OPEN',
        inspectorName: users.find(u => u.id === parseInt(inspectorId))?.name || 'Unknown',

        aktenzeichen: aktenzeichen || null,
        auftragsdatum: auftragsdatum || new Date().toISOString().slice(0, 10),
        frist: frist || null,
        ort: ort || null,
        interneNotiz: interneNotiz || null
    };

    cases.push(newCase);
    res.json(newCase);
});

app.delete('/api/cases/:id', (req, res) => {
    const index = cases.findIndex(c => c.id === parseInt(req.params.id));
    if (index !== -1) {
        cases.splice(index, 1);
    }
    res.json({ message: 'Gelöscht' });
});

// ============ CLIENTS (Auftraggeber) ============

app.get('/api/clients', (req, res) => {
    res.json(clients);
});

app.post('/api/clients', (req, res) => {
    const { firma, ansprechpartner, email, telefon, adresse } = req.body;

    if (!firma) {
        return res.status(400).json({ error: 'Firma ist erforderlich' });
    }

    const newClient = {
        id: clients.length + 1,
        firma,
        ansprechpartner: ansprechpartner || null,
        email: email || null,
        telefon: telefon || null,
        adresse: adresse || null,
        createdAt: new Date().toISOString()
    };

    clients.push(newClient);
    res.json(newClient);
});

// ============ STATS ============

app.get('/api/stats', (req, res) => {
    res.json({
        totalCases: cases.length,
        pendingCases: cases.filter(c => c.status === 'OPEN').length,
        completedCases: cases.filter(c => c.status === 'RELEASED').length,
        activeUsers: users.filter(u => u.isActive).length
    });
});

// ============ SERVER START ============

app.listen(PORT, async () => {
    const adminHash = await bcrypt.hash('TestPass123!', 10);
    users = [
        {
            id: 1,
            name: 'Admin User',
            email: 'admin@example.com',
            password: adminHash,
            role: 'ADMIN',
            isActive: true
        }
    ];

    console.log(`🚀 Server läuft auf http://localhost:${PORT}`);
    console.log('✅ ADMIN Login: admin@example.com / TestPass123!');
});
