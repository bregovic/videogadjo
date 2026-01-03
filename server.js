/**
 * VideoGadjo - Cloud/Local Server
 * Supports both Railway cloud and local development
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { nanoid } = require('nanoid');

const app = express();
const PORT = process.env.PORT || 3333;

// ============================================
// MODE DETECTION
// ============================================

const IS_LOCAL_MODE = !process.env.DATABASE_URL;
console.log(`🔧 Running in ${IS_LOCAL_MODE ? 'LOCAL' : 'CLOUD'} mode`);

// ============================================
// IN-MEMORY STORAGE (for local development)
// ============================================

const localStore = {
    projects: new Map(),
    videos: new Map(),
    marks: new Map(),
    exports: new Map()
};

// ============================================
// DATABASE SETUP (only if cloud mode)
// ============================================

let pool = null;
let S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, getSignedUrl;

if (!IS_LOCAL_MODE) {
    const { Pool } = require('pg');
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    // R2 Storage
    const s3sdk = require('@aws-sdk/client-s3');
    const s3presigner = require('@aws-sdk/s3-request-presigner');
    S3Client = s3sdk.S3Client;
    PutObjectCommand = s3sdk.PutObjectCommand;
    GetObjectCommand = s3sdk.GetObjectCommand;
    DeleteObjectCommand = s3sdk.DeleteObjectCommand;
    getSignedUrl = s3presigner.getSignedUrl;
}

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'videostitch';

// ============================================
// DIRECTORIES
// ============================================

const uploadDir = process.env.NODE_ENV === 'production' ? '/tmp/uploads' : path.join(__dirname, 'uploads');
const proxyDir = process.env.NODE_ENV === 'production' ? '/tmp/proxies' : path.join(__dirname, 'proxies');
const exportDir = process.env.NODE_ENV === 'production' ? '/tmp/exports' : path.join(__dirname, 'exports');
const thumbnailDir = process.env.NODE_ENV === 'production' ? '/tmp/thumbnails' : path.join(__dirname, 'thumbnails');

[uploadDir, proxyDir, exportDir, thumbnailDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ============================================
// MULTER SETUP
// ============================================

const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /mp4|mov|avi|mkv|webm|m4v|3gp/i;
        const ext = path.extname(file.originalname).toLowerCase().slice(1);
        if (allowedTypes.test(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Nepodporovaný formát videa'));
        }
    }
});

// ============================================
// MIDDLEWARE
// ============================================

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve local files
app.use('/proxies', express.static(proxyDir));
app.use('/thumbnails', express.static(thumbnailDir));
app.use('/uploads', express.static(uploadDir));
app.use('/exports', express.static(exportDir));

// ============================================
// UTILITY FUNCTIONS
// ============================================

function generateInviteCode() {
    return nanoid(8).toUpperCase();
}

function parseFilenameDate(filename) {
    const patterns = [
        /VID_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/i,
        /DJI_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/i,
        /(\d{4})[-_](\d{2})[-_](\d{2})[-_\s](\d{2})[-_](\d{2})[-_](\d{2})/,
        /(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/,
        /VID-(\d{4})(\d{2})(\d{2})-WA/i,
    ];

    for (const pattern of patterns) {
        const match = filename.match(pattern);
        if (match) {
            const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
            const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day),
                parseInt(hour), parseInt(minute), parseInt(second));
            if (!isNaN(date.getTime())) return date;
        }
    }
    return null;
}

function detectVideoSource(filename) {
    const name = filename.toUpperCase();
    if (name.match(/^VID_\d{8}_\d{6}/)) return 'android';
    if (name.match(/^IMG_\d{4}/)) return 'iphone';
    if (name.match(/^G[HOX]\d{6}/)) return 'gopro';
    if (name.match(/^DJI_/)) return 'dji';
    if (name.match(/^VID-\d{8}-WA/)) return 'whatsapp';
    return 'other';
}

async function getVideoMetadata(filePath) {
    return new Promise((resolve) => {
        const ffprobe = spawn('ffprobe', [
            '-v', 'quiet', '-print_format', 'json',
            '-show_format', '-show_streams', filePath
        ]);

        let stdout = '';
        ffprobe.stdout.on('data', (data) => { stdout += data; });
        ffprobe.on('error', () => resolve(null));
        ffprobe.on('close', (code) => {
            if (code !== 0) {
                resolve(null);
                return;
            }
            try {
                const data = JSON.parse(stdout);
                const videoStream = data.streams?.find(s => s.codec_type === 'video');
                const format = data.format || {};
                resolve({
                    duration: parseFloat(format.duration) || 0,
                    width: videoStream?.width || 0,
                    height: videoStream?.height || 0,
                    creationTime: format.tags?.creation_time ? new Date(format.tags.creation_time) : null
                });
            } catch (e) {
                resolve(null);
            }
        });
    });
}

// ============================================
// DEBUG LOGGER
// ============================================
const MAX_LOGS = 100;
const memoryLogs = [];

function log(message, type = 'info') {
    const entry = {
        timestamp: new Date().toISOString(),
        type,
        message: typeof message === 'string' ? message : JSON.stringify(message)
    };
    memoryLogs.unshift(entry);
    if (memoryLogs.length > MAX_LOGS) memoryLogs.pop();

    // Also log to console
    if (type === 'error') console.error(`[${entry.timestamp}] ${entry.message}`);
    else console.log(`[${entry.timestamp}] ${entry.message}`);
}

async function generateProxy(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        log(`🎬 FFmpeg Start: ${inputPath} -> ${outputPath}`);

        const ffmpeg = spawn('ffmpeg', [
            '-i', inputPath,
            '-vf', 'scale=640:-2',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '32', // Lower quality for speed
            '-r', '24',
            '-c:a', 'aac',
            '-b:a', '64k',
            '-ac', '1',
            '-y',
            outputPath
        ]);

        let stderr = '';
        ffmpeg.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        ffmpeg.on('error', (err) => {
            log(`❌ FFmpeg Error: ${err.message}`, 'error');
            reject(new Error('FFmpeg not found'));
        });

        ffmpeg.on('close', (code) => {
            if (code !== 0) {
                // Log last few lines of stderr for debugging
                const lines = stderr.split('\n').slice(-10).join('\n');
                log(`❌ FFmpeg Failed (code ${code}):\n${lines}`, 'error');
                reject(new Error(`Proxy generation failed: ${lines}`));
            } else {
                log(`✅ FFmpeg Done: ${outputPath}`);
                resolve(outputPath);
            }
        });
    });
}

async function generateThumbnail(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
            '-i', inputPath,
            '-ss', '00:00:01',
            '-vframes', '1',
            '-vf', 'scale=320:-2',
            '-y',
            outputPath
        ]);

        ffmpeg.on('error', () => reject(new Error('FFmpeg not found')));
        ffmpeg.on('close', (code) => {
            if (code !== 0) reject(new Error('Thumbnail generation failed'));
            else resolve(outputPath);
        });
    });
}

// ============================================
// API ROUTES
// ============================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', mode: IS_LOCAL_MODE ? 'local' : 'cloud', timestamp: new Date().toISOString() });
});

// Check FFmpeg
app.get('/api/check-ffmpeg', (req, res) => {
    const ffmpeg = spawn('ffmpeg', ['-version']);
    ffmpeg.on('error', () => res.json({ available: false }));
    ffmpeg.on('close', (code) => res.json({ available: code === 0 }));
});

// Get Logs
app.get('/api/debug/logs', (req, res) => {
    res.json(memoryLogs);
});

// ============================================
// PROJECT ROUTES (Local Mode)
// ============================================

// Create project
app.post('/api/projects', async (req, res) => {
    try {
        const { name } = req.body;
        const inviteCode = generateInviteCode();

        const project = {
            id: uuidv4(),
            name,
            invite_code: inviteCode,
            created_at: new Date().toISOString(),
            status: 'active'
        };

        if (IS_LOCAL_MODE) {
            localStore.projects.set(project.id, project);
            // Also index by invite code
            localStore.projects.set(inviteCode, project);
        } else {
            const result = await pool.query(
                'INSERT INTO projects (name, invite_code) VALUES ($1, $2) RETURNING *',
                [name, inviteCode]
            );
            Object.assign(project, result.rows[0]);
        }

        res.json({ success: true, project });
    } catch (error) {
        console.error('Create project error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get project by invite code
app.get('/api/projects/join/:code', async (req, res) => {
    try {
        const code = req.params.code.toUpperCase();
        let project;

        if (IS_LOCAL_MODE) {
            project = localStore.projects.get(code);
            if (!project) {
                // Search by invite_code in all projects
                for (const [key, p] of localStore.projects) {
                    if (p.invite_code === code) {
                        project = p;
                        break;
                    }
                }
            }
        } else {
            const result = await pool.query(
                'SELECT * FROM projects WHERE invite_code = $1 AND status = $2',
                [code, 'active']
            );
            project = result.rows[0];
        }

        if (!project) {
            return res.status(404).json({ error: 'Projekt nenalezen' });
        }

        res.json({ success: true, project });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get project with videos
app.get('/api/projects/:id', async (req, res) => {
    try {
        let project, videos;

        if (IS_LOCAL_MODE) {
            project = localStore.projects.get(req.params.id);

            if (!project) {
                return res.status(404).json({ error: 'Projekt nenalezen' });
            }

            // Get videos for this project
            videos = [];
            for (const [key, video] of localStore.videos) {
                if (video.project_id === req.params.id) {
                    // Add marks to video
                    video.marks = [];
                    for (const [mKey, mark] of localStore.marks) {
                        if (mark.video_id === video.id) {
                            video.marks.push(mark);
                        }
                    }
                    videos.push(video);
                }
            }
            videos.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
        } else {
            const projectResult = await pool.query(
                'SELECT * FROM projects WHERE id = $1',
                [req.params.id]
            );

            if (projectResult.rows.length === 0) {
                return res.status(404).json({ error: 'Projekt nenalezen' });
            }
            project = projectResult.rows[0];

            const videosResult = await pool.query(
                `SELECT v.*, 
                        COALESCE(json_agg(m.*) FILTER (WHERE m.id IS NOT NULL), '[]') as marks
                 FROM videos v
                 LEFT JOIN marks m ON m.video_id = v.id
                 WHERE v.project_id = $1
                 GROUP BY v.id
                 ORDER BY v.order_index`,
                [req.params.id]
            );
            videos = videosResult.rows;
        }

        res.json({ success: true, project, videos });
    } catch (error) {
        console.error('Get project error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// VIDEO ROUTES
// ============================================

// Upload video
app.post('/api/projects/:projectId/videos', upload.single('video'), async (req, res) => {
    try {
        const { projectId } = req.params;
        const { uploadedBy } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'Žádný soubor' });
        }

        const videoId = uuidv4();
        const source = detectVideoSource(file.originalname);
        const filenameDate = parseFilenameDate(file.originalname);

        // Get metadata
        const metadata = await getVideoMetadata(file.path);

        const video = {
            id: videoId,
            project_id: projectId,
            original_filename: file.originalname,
            original_path: file.path,
            source,
            duration: metadata?.duration || 0,
            width: metadata?.width || 0,
            height: metadata?.height || 0,
            file_size: file.size,
            filename_date: filenameDate?.toISOString(),
            metadata_date: metadata?.creationTime?.toISOString(),
            upload_date: new Date().toISOString(),
            uploaded_by: uploadedBy || 'anonymous',
            order_index: 0,
            included: true,
            processing_status: 'processing',
            marks: []
        };

        if (IS_LOCAL_MODE) {
            localStore.videos.set(videoId, video);
            // Generate proxy locally
            generateProxyLocally(videoId, file.path, projectId);
        } else {
            // Cloud mode - DB insert + background processing

            // 1. Insert into DB
            await pool.query(
                `INSERT INTO videos (
                    id, project_id, original_filename, original_path, source,
                    duration, width, height, file_size,
                    filename_date, metadata_date, upload_date, uploaded_by,
                    processing_status, included, order_index
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
                [
                    videoId, projectId, file.originalname, file.path, source,
                    video.duration, video.width, video.height, video.file_size,
                    video.filename_date, video.metadata_date, video.upload_date, video.uploaded_by,
                    'processing', true, 0
                ]
            );

            // 2. Start background processing (generate proxy/thumb in /tmp)
            processVideoForCloud(videoId, file.path, projectId);
        }

        res.json({ success: true, video });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Local proxy generation
async function generateProxyLocally(videoId, filePath, projectId) {
    try {
        const proxyFilename = `${videoId}.mp4`;
        const thumbnailFilename = `${videoId}.jpg`;
        const proxyPath = path.join(proxyDir, proxyFilename);
        const thumbPath = path.join(thumbnailDir, thumbnailFilename);

        console.log(`⏳ Generating proxy for ${videoId}...`);

        // Generate proxy
        await generateProxy(filePath, proxyPath);

        // Generate thumbnail
        await generateThumbnail(filePath, thumbPath);

        // Update video record
        const video = localStore.videos.get(videoId);
        if (video) {
            video.processing_status = 'ready';
            video.proxy_url = `/proxies/${proxyFilename}`;
            video.thumbnail_url = `/thumbnails/${thumbnailFilename}`;
            localStore.videos.set(videoId, video);
        }

        console.log(`✅ Proxy ready: ${videoId}`);
    } catch (error) {
        console.error(`❌ Proxy generation failed for ${videoId}:`, error);
        const video = localStore.videos.get(videoId);
        if (video) {
            video.processing_status = 'failed';
            localStore.videos.set(videoId, video);
        }
    }
}


// Cloud proxy generation (Postgres + local /tmp files)
async function processVideoForCloud(videoId, filePath, projectId) {
    try {
        const proxyFilename = `${videoId}.mp4`;
        const thumbnailFilename = `${videoId}.jpg`;
        const proxyPath = path.join(proxyDir, proxyFilename);
        const thumbPath = path.join(thumbnailDir, thumbnailFilename);

        console.log(`☁️ Cloud processing: Generating proxy for ${videoId}...`);

        // Generate proxy
        await generateProxy(filePath, proxyPath);

        // Generate thumbnail
        await generateThumbnail(filePath, thumbPath);

        const proxyUrl = `/proxies/${proxyFilename}`;
        const thumbnailUrl = `/thumbnails/${thumbnailFilename}`;

        // Update DB
        await pool.query(
            `UPDATE videos 
             SET processing_status = $1, proxy_url = $2, thumbnail_url = $3 
             WHERE id = $4`,
            ['ready', proxyUrl, thumbnailUrl, videoId]
        );

        console.log(`✅ Cloud processing complete: ${videoId}`);

    } catch (error) {
        console.error(`❌ Cloud processing failed for ${videoId}:`, error);

        // Update DB with error
        try {
            await pool.query(
                `UPDATE videos SET processing_status = $1 WHERE id = $2`,
                ['failed', videoId]
            );
        } catch (dbError) {
            console.error('Failed to update error status in DB:', dbError);
        }
    }
}

// Delete video
app.delete('/api/videos/:id', async (req, res) => {
    try {
        if (IS_LOCAL_MODE) {
            const video = localStore.videos.get(req.params.id);
            if (video) {
                // Delete files
                if (video.original_path && fs.existsSync(video.original_path)) {
                    fs.unlinkSync(video.original_path);
                }
                localStore.videos.delete(req.params.id);
            }
        } else {
            // Cloud mode - DB delete
            // Get video path first to delete files
            const result = await pool.query('SELECT original_path FROM videos WHERE id = $1', [req.params.id]);
            if (result.rows.length > 0) {
                const video = result.rows[0];
                if (video.original_path && fs.existsSync(video.original_path)) {
                    try { fs.unlinkSync(video.original_path); } catch (e) { console.error('Failed to delete original file', e); }
                }
            }
            // Delete from DB
            await pool.query('DELETE FROM videos WHERE id = $1', [req.params.id]);
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// MARKS ROUTES
// ============================================

// Add mark
app.post('/api/videos/:videoId/marks', async (req, res) => {
    try {
        const { in_point, out_point } = req.body;

        const mark = {
            id: uuidv4(),
            video_id: req.params.videoId,
            in_point,
            out_point,
            created_at: new Date().toISOString()
        };

        if (IS_LOCAL_MODE) {
            localStore.marks.set(mark.id, mark);
            // Update video's marks array
            const video = localStore.videos.get(req.params.videoId);
            if (video) {
                if (!video.marks) video.marks = [];
                video.marks.push(mark);
            }
        } else {
            const result = await pool.query(
                'INSERT INTO marks (video_id, in_point, out_point) VALUES ($1, $2, $3) RETURNING *',
                [req.params.videoId, in_point, out_point]
            );
            Object.assign(mark, result.rows[0]);
        }

        res.json({ success: true, mark });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete mark
app.delete('/api/marks/:id', async (req, res) => {
    try {
        if (IS_LOCAL_MODE) {
            localStore.marks.delete(req.params.id);
            // Also remove from video's marks array
            for (const [key, video] of localStore.videos) {
                if (video.marks) {
                    video.marks = video.marks.filter(m => m.id !== req.params.id);
                }
            }
        } else {
            await pool.query('DELETE FROM marks WHERE id = $1', [req.params.id]);
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// EXPORT ROUTES
// ============================================

// Start export
app.post('/api/projects/:projectId/export', async (req, res) => {
    try {
        const { projectId } = req.params;
        const { name } = req.body;

        const exportId = uuidv4();

        const exportData = {
            id: exportId,
            project_id: projectId,
            status: 'queued',
            progress: 0,
            created_at: new Date().toISOString()
        };

        if (IS_LOCAL_MODE) {
            localStore.exports.set(exportId, exportData);
            processExportLocally(exportId, projectId, name || 'export');
        } else {
            await pool.query(
                'INSERT INTO exports (id, project_id, status) VALUES ($1, $2, $3)',
                [exportId, projectId, 'queued']
            );
            // Cloud export logic...
        }

        res.json({ success: true, exportId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get export status
app.get('/api/exports/:id', async (req, res) => {
    try {
        let exportData;

        if (IS_LOCAL_MODE) {
            exportData = localStore.exports.get(req.params.id);
        } else {
            const result = await pool.query(
                'SELECT * FROM exports WHERE id = $1',
                [req.params.id]
            );
            exportData = result.rows[0];
        }

        if (!exportData) {
            return res.status(404).json({ error: 'Export nenalezen' });
        }

        res.json({ success: true, export: exportData });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Local export processing
async function processExportLocally(exportId, projectId, name) {
    const exportData = localStore.exports.get(exportId);
    if (!exportData) return;

    try {
        exportData.status = 'processing';

        // Get videos for this project
        const videos = [];
        for (const [key, video] of localStore.videos) {
            if (video.project_id === projectId && video.included && video.processing_status === 'ready') {
                videos.push(video);
            }
        }

        videos.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

        // For now, just simulate completion
        exportData.progress = 100;
        exportData.status = 'ready';
        exportData.completed_at = new Date().toISOString();

        console.log(`✅ Export completed: ${exportId}`);
    } catch (error) {
        console.error(`❌ Export failed: ${exportId}`, error);
        exportData.status = 'failed';
        exportData.error_message = error.message;
    }
}

// ============================================
// DATABASE INITIALIZATION (Cloud only)
// ============================================

async function initDatabase() {
    if (IS_LOCAL_MODE) {
        console.log('📦 Using in-memory storage');
        return;
    }

    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS projects (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                invite_code VARCHAR(20) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                status VARCHAR(50) DEFAULT 'active'
            );

            CREATE TABLE IF NOT EXISTS videos (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
                original_filename VARCHAR(500) NOT NULL,
                original_path TEXT,
                proxy_key VARCHAR(500),
                thumbnail_key VARCHAR(500),
                proxy_url TEXT,
                thumbnail_url TEXT,
                source VARCHAR(50),
                duration FLOAT,
                width INT,
                height INT,
                file_size BIGINT,
                filename_date TIMESTAMP,
                metadata_date TIMESTAMP,
                upload_date TIMESTAMP DEFAULT NOW(),
                uploaded_by VARCHAR(255),
                order_index INT DEFAULT 0,
                included BOOLEAN DEFAULT true,
                processing_status VARCHAR(50) DEFAULT 'pending'
            );

            -- Add marks table
            CREATE TABLE IF NOT EXISTS marks (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
                in_point FLOAT NOT NULL,
                out_point FLOAT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS exports (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
                export_key VARCHAR(500),
                status VARCHAR(50) DEFAULT 'pending',
                progress INT DEFAULT 0,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                completed_at TIMESTAMP
            );

            -- Migrations for existing tables
            ALTER TABLE videos ADD COLUMN IF NOT EXISTS original_path TEXT;
            ALTER TABLE videos ADD COLUMN IF NOT EXISTS width INT;
            ALTER TABLE videos ADD COLUMN IF NOT EXISTS height INT;
            ALTER TABLE videos ADD COLUMN IF NOT EXISTS proxy_url TEXT;
            ALTER TABLE videos ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
        `);
        console.log('✅ Database initialized and migrated');
    } finally {
        client.release();
    }
}

// ============================================
// START SERVER
// ============================================

async function start() {
    try {
        await initDatabase();

        app.listen(PORT, () => {
            console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🎬 VideoGadjo Server                                       ║
║                                                              ║
║   http://localhost:${PORT}                                      ║
║   Mode: ${IS_LOCAL_MODE ? 'LOCAL (in-memory)' : 'CLOUD (PostgreSQL + R2)'}               ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
            `);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

start();
