require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Chat = require('./models/Chat');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Configure Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-flash-latest",
    systemInstruction: "You are Cozil, a friendly, empathetic, and knowledgeable Pharmacist and Medical Assistant. Your primary role is to help users understand their medical reports and answer health-related questions. \n\nOUTPUT GUIDELINES:\n1. Use **bold** for key terms and takeaways.\n2. Use lists (bulleted or numbered) to break down information clearly.\n3. Use `code blocks` for specific values or ranges if useful for clarity, but prefer text.\n4. Use LaTeX for any formulas or chemical equations (e.g. $H_2O$, $\\frac{mg}{dL}$).\n5. Use Markdown tables for comparing values if needed.\n\nWhen analyzing reports:\n1. Break down complex medical terms into simple, easy-to-understand language.\n2. Explain what the values mean in context (normal, high, low).\n3. Provide general advice on next steps or lifestyle changes if applicable, but ALWAYS advise consulting a doctor for a final diagnosis.\n\nWhen chatting generally:\n1. Be warm, professional, and reassuring.\n2. Keep answers concise but informative.\n3. Always prioritize patient safety.\n\nIMPORTANT: You are an AI, not a doctor. Always include a disclaimer when giving specific medical advice."
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
const expressLayouts = require('express-ejs-layouts');
app.use(expressLayouts);
app.set('layout', 'layout');
app.set('view engine', 'ejs');

// Session Config
app.use(session({
    secret: 'cozil_secret_key_change_this',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Make user available to all views
app.use((req, res, next) => {
    res.locals.user = req.session.user;
    next();
});

// File Upload Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Auth Middleware
const isAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/login');
};

// Routes


// Routes

// Landing Page (Public)
app.get('/', (req, res) => {
    // If logged in, maybe we still show landing but with "Go to App" button?
    // Or redirect? Standard SaaS often redirects logged in users to app.
    // User asked for "Landing page also". Let's show landing page at root always.

    // We need to use a different layout for landing page
    res.render('landing', {
        title: 'Cozil Health - AI Medical Assistant',
        layout: 'layout-marketing'
    });
});

// App Dashboard (Chat) - Protected or Guest?
// User wanted "Basic auth" and "History".
// Let's make /app the main chat interface.
app.get('/app', (req, res) => {
    // If not logged in, we can allow guest access (based on prior conversation "normal chatting option")
    // But they won't have history.
    res.render('index', { title: 'Cozil - Dashboard' });
});

// Auth Routes
app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/app');
    res.render('login', { error: null, title: 'Login' });
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.render('login', { error: 'Invalid credentials', title: 'Login' });
        }
        req.session.user = user;
        req.session.save(() => {
            res.redirect('/app');
        });
    } catch (err) {
        console.error(err);
        res.render('login', { error: 'An error occurred', title: 'Login' });
    }
});

app.get('/register', (req, res) => {
    if (req.session.user) return res.redirect('/app');
    res.render('register', { error: null, title: 'Register' });
});

app.post('/register', async (req, res) => {
    try {
        const { username, password, confirmPassword } = req.body;
        if (password !== confirmPassword) {
            return res.render('register', { error: 'Passwords do not match', title: 'Register' });
        }

        // Check if user exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.render('register', { error: 'Username already taken', title: 'Register' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, password: hashedPassword });
        await user.save();
        res.redirect('/login');
    } catch (err) {
        console.error(err);
        res.render('register', { error: 'Error creating account', title: 'Register' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// History Routes
app.get('/history', isAuthenticated, async (req, res) => {
    try {
        const chats = await Chat.find({ userId: req.session.user._id }).sort({ createdAt: -1 });
        res.render('history', { title: 'History', chats });
    } catch (err) {
        console.error(err);
        res.redirect('/app');
    }
});

// Chat API
app.post('/api/chat', upload.single('report'), async (req, res) => {
    try {
        const { message, history } = req.body;
        let prompt = message || "Please analyze this report.";
        let parts = [];

        // Handle File Upload (Image or PDF)
        if (req.file) {
            const mimeType = req.file.mimetype;
            const filePath = req.file.path;

            if (mimeType === 'application/pdf') {
                const dataBuffer = fs.readFileSync(filePath);
                const pdfData = await pdfParse(dataBuffer);
                prompt += `\n\nHere is the content of the attached medical report:\n${pdfData.text}`;
            } else if (mimeType.startsWith('image/')) {
                const imageBuffer = fs.readFileSync(filePath);
                const imageBase64 = imageBuffer.toString('base64');
                parts.push({
                    inlineData: {
                        data: imageBase64,
                        mimeType: mimeType
                    }
                });
            }

            // Cleanup file
            fs.unlinkSync(filePath);
        }

        parts.push({ text: prompt });

        let chatHistory = [];
        if (history) {
            try {
                chatHistory = JSON.parse(history);
            } catch (e) {
                console.log("Error parsing history", e);
            }
        }

        const chatSession = model.startChat({
            history: chatHistory
        });

        const result = await chatSession.sendMessage(parts);
        const response = await result.response;
        const text = response.text();

        // SAVE TO HISTORY IF LOGGED IN
        if (req.session.user) {
            try {
                // Check if this is a continuation of a session (frontend would need to send chat ID)
                // For simplicity, let's assume we create a new chat entry for every "session" or 
                // the user is just sending single messages. 
                // Ideally, we'd update an existing chat document. 
                // For now, let's just create a new chat document if it's the *start* or find recent?
                // "History" implies viewing past logs. 
                // A simple way: Save the entire conversation state as one document, updating it.
                // But we don't have a chat ID from frontend. 

                // Let's CREATE a new Chat document if history is empty (start of convo) 
                // We need a way to link messages.
                // Actually, simplest 'History' is just saving the interaction. 
                // Let's save just this turn for now, or refine:
                // If we want a nice history, we need a sessionId. 
                // But to not break things, let's just save independent interactions or 
                // try to group them by time? No, that's messy.

                // Allow the frontend to potentially send a 'chatId' if we implemented it, 
                // but for now, we'll just save a new "Chat" entry for every interaction 
                // OR finding the most recent active chat?
                // Let's create a NEW chat for every page load (new session).
                // But we are in a stateless API call structure (sort of).
                // Let's just save this interaction as a "Chat" where title = user query.
                // This effectively makes "History" a list of queries/responses.

                const newChat = new Chat({
                    userId: req.session.user._id,
                    title: message ? message.substring(0, 50) : 'Report Analysis',
                    messages: [
                        { role: 'user', content: prompt },
                        { role: 'model', content: text }
                    ]
                });
                await newChat.save();

            } catch (saveErr) {
                console.error("Error saving chat history", saveErr);
            }
        }

        res.json({ success: true, response: text });

    } catch (error) {
        console.error('Error processing request:', error);
        if (error.status === 429 || error.message.includes('429')) {
            return res.status(429).json({ success: false, message: "Usage limit exceeded for this model. Please try again later." });
        }
        res.status(500).json({ success: false, message: "Sorry, I encountered an error processing your request." });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

