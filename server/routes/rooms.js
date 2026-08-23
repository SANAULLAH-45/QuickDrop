const express = require('express');
const router = express.Router();

const roomController = require('../controllers/roomController');
const { upload } = require('../middleware/upload');
const { createRoomLimiter, joinRoomLimiter, uploadLimiter } = require('../middleware/rateLimiter');

router.post('/', createRoomLimiter, roomController.createRoom);
router.get('/:code', joinRoomLimiter, roomController.getRoom);
router.post('/:code/files', uploadLimiter, upload.single('file'), roomController.uploadFile);
router.get('/:code/files/:fileId', roomController.downloadFile);
router.delete('/:code/files/:fileId', roomController.deleteFile);

module.exports = router;
