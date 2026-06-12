const express = require('express');
const router = express.Router();
const aiChatController = require('../controllers/aiChatController');
const { authMiddleware } = require('../middleware/auth');

// AI Chat endpoint (public for chat widget, but can be authenticated)
router.post('/chat', authMiddleware, aiChatController.chatWithAI);

module.exports = router;