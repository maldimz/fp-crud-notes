const express = require('express')
const app = express()
const port = 5000
const jwt = require('jsonwebtoken');
const secretKey = 'your_secret_key'; // Replace with your secret key
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { Storage } = require('@google-cloud/storage');
var cors = require('cors')

// Create a Multer storage engine that saves files to GCS
const multerStorage = multer.memoryStorage();
const multerUpload = multer({ storage: multerStorage });

const storage = new Storage({
  projectId: 'h-07-2',
  keyFilename: './h-07-2-97b5e94533f9.json',
});
const bucketName = 'fp-notes';

app.use(express.json());

app.use(cors())

app.get('/', (req, res) => {
  res.send('Hello World!')
})

// GET all notes
app.get('/notes', authenticate, async (req, res) => {
  // console.log(req.userId)
  try {
    const notes = await prisma.note.findMany({
      where: {
        user_id: parseInt(req.userId),
      },
    });
    res.json(notes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET a specific note by ID
app.get('/notes/:id', authenticate, async (req, res) => {
  const noteId = parseInt(req.params.id);

  try {
    const note = await prisma.note.findFirst({
      where: {
        AND: [
          { id: noteId },
          { user_id: parseInt(req.userId) },
        ],
      }
    })

    if (note) {
      res.json(note);
    } else {
      res.status(404).json({ error: 'Note not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST a new note
app.post('/notes', authenticate, multerUpload.single('attachment'), async (req, res) => {
  const { title, description } = req.body;
  const file = req.file;
  console.log("file", file)

  try {
    let attachmentUrl;

    if (file) {
      const filename = `${Date.now()}_${file.originalname}`;
      const blob = storage.bucket(bucketName).file(filename);
      const blobStream = blob.createWriteStream();
      blobStream.on('error', (err) => {
        console.error('Error uploading file:', err);
        res.status(500).json({ error: 'Error uploading file' });
      });
      blobStream.end(file.buffer);
      attachmentUrl = `https://storage.googleapis.com/${bucketName}/${filename}`;
    }

    const note = await prisma.note.create({
      data: {
        title,
        description,
        urlFile: attachmentUrl,
        user: {
          connect: {
            id: parseInt(req.userId),
          }
        },
      },
    });

    res.json(note);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PUT an existing note
app.put('/notes/:id', authenticate, multerUpload.single('attachment'), async (req, res) => {
  const noteId = parseInt(req.params.id);
  const { title, description } = req.body;
  const file = req.file;

  try {
    const note = await prisma.note.findFirst({
      where: {
        AND: [
          { id: noteId },
          { user_id: parseInt(req.userId) },
        ],
      }
    })

    if (note) {
      let attachmentUrl;

      if (file) {
        const filename = `${Date.now()}_${file.originalname}`;
        const blob = storage.bucket(bucketName).file(filename);
        const blobStream = blob.createWriteStream();
        blobStream.on('error', (err) => {
          console.error('Error uploading file:', err);
          res.status(500).json({ error: 'Error uploading file' });
        });
        blobStream.end(file.buffer);
        attachmentUrl = `https://storage.googleapis.com/${bucketName}/${filename}`;
      }

      const updatedNote = await prisma.note.update({
        where: {
          id: noteId,
        },
        data: {
          title,
          description,
          urlFile: attachmentUrl,
        },
      });

      res.json(updatedNote);
    } else {
      res.status(404).json({ error: 'Note not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE an existing note
app.delete('/notes/:id', authenticate, async (req, res) => {
  const noteId = parseInt(req.params.id);

  try {
    const note = await prisma.note.findFirst({
      where: {
        AND: [
          { id: noteId },
          { user_id: parseInt(req.userId) },
        ],
      }
    })

    if (note) {
      await prisma.note.delete({
        where: {
          id: noteId,
        },
      });

      res.json({ message: 'Note deleted successfully' });
    } else {
      res.status(404).json({ error: 'Note not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});



function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]; // Extract token from Authorization header

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, secretKey);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})