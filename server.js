const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

// ⚠️ Simple protection for now. Change this password.
// This will be replaced by a real login system in a future phase.
const ADMIN_KEY = "mysecret123";

app.use(express.json());

// Upload folder
const uploadDir = path.join(__dirname, "videos");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Metadata file — stores title + upload time for every video
const metaFile = path.join(__dirname, "videos.json");

function readMeta() {
    if (!fs.existsSync(metaFile)) return [];
    try {
        return JSON.parse(fs.readFileSync(metaFile, "utf-8"));
    } catch (e) {
        return [];
    }
}

function writeMeta(data) {
    fs.writeFileSync(metaFile, JSON.stringify(data, null, 2));
}

// Checks the x-admin-key header before allowing upload/delete
function checkAdminKey(req, res, next) {
    const key = req.headers["x-admin-key"];
    if (key !== ADMIN_KEY) {
        return res.status(403).json({ error: "Unauthorized. Wrong or missing admin key." });
    }
    next();
}

// Video storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext)
            .replace(/[^a-zA-Z0-9-_]/g, "-");
        cb(null, `${Date.now()}-${name}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 2 * 1024 * 1024 * 1024 // 2 GB max
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("video/")) {
            cb(null, true);
        } else {
            cb(new Error("Only video files are allowed."));
        }
    }
});

// Public website files
app.use((req, res, next) => {

    // Public ko Gallery aur Upload page se rokna
    if (
        req.path === "/gallery.html" ||
        req.path === "/upload.html"
    ) {
        return res.redirect("/");
    }

    next();
});

app.use(express.static(__dirname));

// Video files
app.use("/videos", express.static(uploadDir));

// Get uploaded videos (with title + upload time), newest first
app.get("/api/videos", (req, res) => {
    const meta = readMeta();

    // Only return entries whose actual file still exists on disk
    const valid = meta.filter(v => fs.existsSync(path.join(uploadDir, v.filename)));

    valid.sort((a, b) => b.uploadedAt - a.uploadedAt);

    res.json(valid);
});

// ⬇️ यह code यहाँ डालो
app.get("/video/:filename", (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(uploadDir, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send("Video not found");
    }

    res.redirect("/videos.html?video=" + encodeURIComponent(filename));

});   
// Upload API — protected by admin key

// Upload API — protected by admin key
app.post("/upload", checkAdminKey, upload.single("video"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No video uploaded." });
    }

    const title = (req.body.title && req.body.title.trim())
        ? req.body.title.trim()
        : req.file.originalname;

    const meta = readMeta();
    meta.push({
        filename: req.file.filename,
        title: title,
        uploadedAt: Date.now(),
        url: `/videos/${req.file.filename}`
    });
    writeMeta(meta);

    res.json({
        message: "Video uploaded successfully!",
        filename: req.file.filename,
        title: title,
        url: `/videos/${req.file.filename}`
    });
});

// Delete API — protected by admin key
app.delete("/api/videos/:filename", checkAdminKey, (req, res) => {
    const filename = req.params.filename;
    const safeName = path.basename(filename);
    const filePath = path.join(uploadDir, safeName);

    if (!filePath.startsWith(uploadDir)) {
        return res.status(400).json({ error: "Invalid filename." });
    }

    fs.unlink(filePath, (err) => {
        if (err) {
            return res.status(404).json({ error: "File not found." });
        }

        // Remove from metadata too
        const meta = readMeta().filter(v => v.filename !== safeName);
        writeMeta(meta);

        res.json({ message: "Video deleted successfully." });
    });
});

// Error handling (e.g. file too large, wrong file type)
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: err.message || "Upload failed." });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
});