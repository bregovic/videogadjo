/**
 * VideoStitch - Cloud Video Editor
 * Frontend Application
 */

class VideoStitchApp {
    constructor() {
        // State
        this.project = null;
        this.videos = [];
        this.activeVideoId = null;
        this.currentInPoint = null;
        this.sortMode = 'smart';
        this.userName = localStorage.getItem('videostitch_username') || '';
        this.refreshInterval = null;

        // Cache DOM elements
        this.cacheElements();
        this.bindEvents();
        this.checkUrlForProject();
    }

    cacheElements() {
        this.elements = {
            // Screens
            landingScreen: document.getElementById('landing-screen'),
            editorScreen: document.getElementById('editor-screen'),

            // Landing
            createProjectCard: document.getElementById('create-project-card'),
            joinProjectCard: document.getElementById('join-project-card'),
            createForm: document.getElementById('create-form'),
            joinForm: document.getElementById('join-form'),
            projectName: document.getElementById('project-name'),
            inviteCode: document.getElementById('invite-code'),
            userNameInput: document.getElementById('user-name'),
            cancelCreate: document.getElementById('cancel-create'),
            confirmCreate: document.getElementById('confirm-create'),
            cancelJoin: document.getElementById('cancel-join'),
            confirmJoin: document.getElementById('confirm-join'),

            // Header
            btnBack: document.getElementById('btn-back'),
            headerProjectName: document.getElementById('header-project-name'),
            headerProjectCode: document.getElementById('header-project-code'),
            btnUpload: document.getElementById('btn-upload'),
            btnExport: document.getElementById('btn-export'),
            btnStorage: document.getElementById('btn-storage'),
            syncStatus: document.getElementById('sync-status'),

            // Player
            videoPlayer: document.getElementById('video-player'),
            videoPlaceholder: document.getElementById('video-placeholder'),
            videoLoading: document.getElementById('video-loading'),
            currentTime: document.getElementById('current-time'),
            duration: document.getElementById('duration'),
            timeline: document.getElementById('video-timeline'),
            timelineProgress: document.getElementById('timeline-progress'),
            timelineMarks: document.getElementById('timeline-marks'),
            playIcon: document.getElementById('play-icon'),

            // Controls
            btnSkipBack: document.getElementById('btn-skip-back'),
            btnPlayPause: document.getElementById('btn-play-pause'),
            btnSkipForward: document.getElementById('btn-skip-forward'),
            btnInPoint: document.getElementById('btn-in-point'),
            btnOutPoint: document.getElementById('btn-out-point'),

            // Marks
            marksContainer: document.getElementById('marks-container'),

            // List
            videoCount: document.getElementById('video-count'),
            sortSelect: document.getElementById('sort-select'),
            uploadDropzone: document.getElementById('upload-dropzone'),
            fileInput: document.getElementById('file-input'),
            uploadProgress: document.getElementById('upload-progress'),
            uploadProgressText: document.getElementById('upload-progress-text'),
            uploadProgressFill: document.getElementById('upload-progress-fill'),
            videosList: document.getElementById('videos-list'),

            // Stats
            totalCount: document.getElementById('total-count'),
            readyCount: document.getElementById('ready-count'),
            totalDuration: document.getElementById('total-duration'),

            // Export modal
            exportModal: document.getElementById('export-modal'),
            exportName: document.getElementById('export-name'),
            exportSummary: document.getElementById('export-summary'),
            btnCancelExport: document.getElementById('btn-cancel-export'),
            btnConfirmExport: document.getElementById('btn-confirm-export'),

            // Export progress modal
            exportProgressModal: document.getElementById('export-progress-modal'),
            exportProgressTitle: document.getElementById('export-progress-title'),
            exportProgressFill: document.getElementById('export-progress-fill'),
            exportProgressText: document.getElementById('export-progress-text'),

            // Toast
            toastContainer: document.getElementById('toast-container'),

            // Storage modal
            storageModal: document.getElementById('storage-modal'),
            cacheCount: document.getElementById('cache-count'),
            cacheSize: document.getElementById('cache-size'),
            cachedList: document.getElementById('cached-list'),
            btnClearCache: document.getElementById('btn-clear-cache'),
            btnCloseStorage: document.getElementById('btn-close-storage')
        };
    }

    bindEvents() {
        // Landing actions
        this.elements.createProjectCard.addEventListener('click', () => this.showCreateForm());
        this.elements.joinProjectCard.addEventListener('click', () => this.showJoinForm());

        // Form events
        this.elements.cancelCreate.addEventListener('click', () => this.hideCreateForm());
        this.elements.confirmCreate.addEventListener('click', () => this.createProject());
        this.elements.cancelJoin.addEventListener('click', () => this.hideJoinForm());
        this.elements.confirmJoin.addEventListener('click', () => this.joinProject());

        // Allow Enter key in forms
        this.elements.projectName.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.createProject();
        });
        this.elements.inviteCode.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinProject();
        });

        // Header
        this.elements.btnBack.addEventListener('click', () => this.leaveProject());
        this.elements.headerProjectCode.addEventListener('click', () => this.copyInviteCode());
        this.elements.btnUpload.addEventListener('click', () => this.elements.fileInput.click());
        this.elements.btnExport.addEventListener('click', () => this.showExportModal());
        if (this.elements.btnStorage) {
            this.elements.btnStorage.addEventListener('click', () => this.showStorageModal());
        }

        // Upload
        this.elements.uploadDropzone.addEventListener('click', () => this.elements.fileInput.click());
        this.elements.uploadDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.uploadDropzone.classList.add('dragover');
        });
        this.elements.uploadDropzone.addEventListener('dragleave', () => {
            this.elements.uploadDropzone.classList.remove('dragover');
        });
        this.elements.uploadDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.uploadDropzone.classList.remove('dragover');
            this.handleFiles(e.dataTransfer.files);
        });
        this.elements.fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
            e.target.value = '';
        });

        // Sort
        this.elements.sortSelect.addEventListener('change', (e) => {
            this.sortMode = e.target.value;
            this.sortVideos();
            this.renderVideosList();
        });

        // Player controls
        this.elements.btnPlayPause.addEventListener('click', () => this.togglePlayPause());
        this.elements.btnSkipBack.addEventListener('click', () => this.skip(-10));
        this.elements.btnSkipForward.addEventListener('click', () => this.skip(10));
        this.elements.btnInPoint.addEventListener('click', () => this.setInPoint());
        this.elements.btnOutPoint.addEventListener('click', () => this.setOutPoint());

        // Video player events
        this.elements.videoPlayer.addEventListener('timeupdate', () => this.updateTimeline());
        this.elements.videoPlayer.addEventListener('loadedmetadata', () => this.onVideoLoaded());
        this.elements.videoPlayer.addEventListener('play', () => this.elements.playIcon.textContent = '⏸️');
        this.elements.videoPlayer.addEventListener('pause', () => this.elements.playIcon.textContent = '▶️');

        // Timeline
        this.elements.timeline.addEventListener('click', (e) => this.seekToPosition(e));

        // Export modal
        this.elements.btnCancelExport.addEventListener('click', () => this.hideExportModal());
        this.elements.btnConfirmExport.addEventListener('click', () => this.startExport());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // Storage modal
        if (this.elements.btnClearCache) {
            this.elements.btnClearCache.addEventListener('click', () => this.clearCache());
        }
        if (this.elements.btnCloseStorage) {
            this.elements.btnCloseStorage.addEventListener('click', () => this.hideStorageModal());
        }
    }

    // ==========================================
    // URL Handling
    // ==========================================

    checkUrlForProject() {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('project') || params.get('p');

        if (code) {
            this.elements.inviteCode.value = code.toUpperCase();
            this.showJoinForm();
        } else {
            // Check localStorage for last project
            const lastProject = localStorage.getItem('videostitch_last_project');
            if (lastProject) {
                this.loadProject(lastProject);
            }
        }
    }

    // ==========================================
    // Project Management
    // ==========================================

    showCreateForm() {
        this.elements.createForm.classList.add('visible');
        this.elements.projectName.focus();
    }

    hideCreateForm() {
        this.elements.createForm.classList.remove('visible');
    }

    showJoinForm() {
        this.elements.joinForm.classList.add('visible');
        if (this.userName) {
            this.elements.userNameInput.value = this.userName;
        }
        this.elements.inviteCode.focus();
    }

    hideJoinForm() {
        this.elements.joinForm.classList.remove('visible');
    }

    async createProject() {
        const name = this.elements.projectName.value.trim();
        if (!name) {
            this.showToast('Zadejte název projektu', 'error');
            return;
        }

        try {
            const response = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });

            const data = await response.json();

            if (data.success) {
                this.hideCreateForm();
                this.openProject(data.project);
                this.showToast(`Projekt vytvořen! Kód: ${data.project.invite_code}`);
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            this.showToast('Chyba při vytváření projektu: ' + error.message, 'error');
        }
    }

    async joinProject() {
        const code = this.elements.inviteCode.value.trim().toUpperCase();
        const userName = this.elements.userNameInput.value.trim();

        if (!code) {
            this.showToast('Zadejte kód projektu', 'error');
            return;
        }

        if (userName) {
            this.userName = userName;
            localStorage.setItem('videostitch_username', userName);
        }

        try {
            const response = await fetch(`/api/projects/join/${code}`);
            const data = await response.json();

            if (data.success) {
                this.hideJoinForm();
                this.openProject(data.project);
            } else {
                throw new Error(data.error || 'Projekt nenalezen');
            }
        } catch (error) {
            this.showToast('Chyba: ' + error.message, 'error');
        }
    }

    async loadProject(projectId) {
        try {
            const response = await fetch(`/api/projects/${projectId}`);
            const data = await response.json();

            if (data.success) {
                this.openProject(data.project, data.videos);
            }
        } catch (error) {
            console.error('Failed to load project:', error);
            localStorage.removeItem('videostitch_last_project');
        }
    }

    openProject(project, videos = []) {
        this.project = project;
        this.videos = videos;

        // Update UI
        this.elements.headerProjectName.textContent = project.name;
        this.elements.headerProjectCode.textContent = project.invite_code;

        // Show editor
        this.elements.landingScreen.classList.add('hidden');
        this.elements.editorScreen.classList.remove('hidden');

        // Update URL
        const url = new URL(window.location);
        url.searchParams.set('p', project.invite_code);
        window.history.replaceState({}, '', url);

        // Save to localStorage
        localStorage.setItem('videostitch_last_project', project.id);

        // Render videos
        this.sortVideos();
        this.renderVideosList();
        this.updateStats();

        // Start refresh interval
        this.startAutoRefresh();
    }

    leaveProject() {
        this.stopAutoRefresh();
        this.project = null;
        this.videos = [];
        this.activeVideoId = null;

        // Clear URL
        const url = new URL(window.location);
        url.searchParams.delete('p');
        url.searchParams.delete('project');
        window.history.replaceState({}, '', url);

        // Show landing
        this.elements.editorScreen.classList.add('hidden');
        this.elements.landingScreen.classList.remove('hidden');
    }

    copyInviteCode() {
        const code = this.project?.invite_code;
        if (code) {
            const url = `${window.location.origin}${window.location.pathname}?p=${code}`;
            navigator.clipboard.writeText(url).then(() => {
                this.showToast('Link zkopírován do schránky!');
            });
        }
    }

    // ==========================================
    // Auto Refresh
    // ==========================================

    startAutoRefresh() {
        this.stopAutoRefresh();
        this.refreshInterval = setInterval(() => this.refreshProject(), 5000);
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    async refreshProject() {
        if (!this.project) return;

        try {
            const response = await fetch(`/api/projects/${this.project.id}`);
            const data = await response.json();

            if (data.success) {
                // Check for changes
                const hasChanges = JSON.stringify(this.videos) !== JSON.stringify(data.videos);

                if (hasChanges) {
                    this.videos = data.videos;
                    this.sortVideos();
                    this.renderVideosList();
                    this.updateStats();
                }

                this.elements.syncStatus.querySelector('.sync-dot').classList.remove('syncing');
            }
        } catch (error) {
            console.error('Refresh failed:', error);
        }
    }

    // ==========================================
    // File Upload
    // ==========================================

    async handleFiles(files) {
        const videoFiles = Array.from(files).filter(f => f.type.startsWith('video/'));

        if (videoFiles.length === 0) {
            this.showToast('Žádné video soubory', 'error');
            return;
        }

        this.elements.uploadProgress.classList.remove('hidden');

        for (let i = 0; i < videoFiles.length; i++) {
            const file = videoFiles[i];
            const progress = Math.round((i / videoFiles.length) * 100);

            this.elements.uploadProgressText.textContent = `${i + 1}/${videoFiles.length} - ${file.name}`;
            this.elements.uploadProgressFill.style.width = `${progress}%`;

            try {
                await this.uploadFile(file);
            } catch (error) {
                console.error('Upload failed:', file.name, error);
                this.showToast(`Chyba: ${file.name}`, 'error');
            }
        }

        this.elements.uploadProgress.classList.add('hidden');
        this.elements.uploadProgressFill.style.width = '0%';

        this.showToast(`Nahráno ${videoFiles.length} videí`);
        await this.refreshProject();
    }

    async uploadFile(file) {
        const formData = new FormData();
        formData.append('video', file);
        formData.append('uploadedBy', this.userName || 'anonymous');

        const response = await fetch(`/api/projects/${this.project.id}/videos`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error);
        }

        return data.video;
    }

    // ==========================================
    // Video List
    // ==========================================

    sortVideos() {
        switch (this.sortMode) {
            case 'smart':
                this.videos.sort((a, b) => {
                    const dateA = this.getBestDate(a);
                    const dateB = this.getBestDate(b);
                    return dateA - dateB;
                });
                break;
            case 'upload':
                this.videos.sort((a, b) => new Date(a.upload_date) - new Date(b.upload_date));
                break;
            case 'filename':
                this.videos.sort((a, b) => a.original_filename.localeCompare(b.original_filename));
                break;
            case 'manual':
                this.videos.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
                break;
        }
    }

    getBestDate(video) {
        if (video.metadata_date) return new Date(video.metadata_date);
        if (video.filename_date) return new Date(video.filename_date);
        return new Date(video.upload_date);
    }

    renderVideosList() {
        this.elements.videoCount.textContent = `(${this.videos.length})`;

        if (this.videos.length === 0) {
            this.elements.videosList.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">📹</span>
                    <p>Zatím žádná videa</p>
                    <p class="empty-hint">Nahrajte videa pomocí tlačítka nahoře</p>
                </div>
            `;
            return;
        }

        this.elements.videosList.innerHTML = this.videos.map(video => {
            const isActive = this.activeVideoId === video.id;
            const hasMarks = video.marks && video.marks.length > 0;
            const isProcessing = video.processing_status === 'processing' || video.processing_status === 'pending';
            const isFailed = video.processing_status === 'failed';

            return `
                <div class="video-item ${isActive ? 'active' : ''} ${isProcessing ? 'processing' : ''} ${!video.included ? 'excluded' : ''}"
                     data-id="${video.id}">
                    ${video.thumbnail_url
                    ? `<img class="video-thumbnail" src="${video.thumbnail_url}" alt="">`
                    : `<div class="video-thumbnail-placeholder">${isProcessing ? '⏳' : '🎬'}</div>`
                }
                    <div class="video-info">
                        <div class="video-name" title="${video.original_filename}">${video.original_filename}</div>
                        <div class="video-meta">
                            <span class="video-source source-${video.source || 'other'}">${video.source || 'video'}</span>
                            ${video.uploaded_by ? `<span>od ${video.uploaded_by}</span>` : ''}
                        </div>
                    </div>
                    <div class="video-status">
                        ${isProcessing
                    ? '<span class="status-badge status-processing">Zpracovává se</span>'
                    : isFailed
                        ? '<span class="status-badge status-failed">Chyba</span>'
                        : ''
                }
                    </div>
                    ${video.duration ? `<span class="video-duration">${this.formatDuration(video.duration)}</span>` : ''}
                    ${hasMarks ? '<span class="video-marks-indicator" title="Má značky"></span>' : ''}
                </div>
            `;
        }).join('');

        // Bind click events
        this.elements.videosList.querySelectorAll('.video-item').forEach(item => {
            item.addEventListener('click', () => this.playVideo(item.dataset.id));
        });

        this.elements.btnExport.disabled = this.videos.filter(v => v.processing_status === 'ready').length === 0;
    }

    updateStats() {
        const total = this.videos.length;
        const ready = this.videos.filter(v => v.processing_status === 'ready').length;
        const totalDuration = this.videos.reduce((sum, v) => sum + (v.duration || 0), 0);

        this.elements.totalCount.textContent = total;
        this.elements.readyCount.textContent = ready;
        this.elements.totalDuration.textContent = this.formatDuration(totalDuration);
    }

    // ==========================================
    // Video Playback
    // ==========================================

    async playVideo(videoId) {
        const video = this.videos.find(v => v.id === videoId);
        if (!video) return;

        if (video.processing_status !== 'ready') {
            this.showToast('Video ještě není zpracované', 'error');
            return;
        }

        this.activeVideoId = videoId;

        // Show loading
        this.elements.videoPlaceholder.classList.add('hidden');
        this.elements.videoLoading.classList.remove('hidden');

        try {
            let videoUrl = video.proxy_url;

            // Try to use cached version if proxyCache is available
            if (window.proxyCache && video.proxy_url) {
                const cached = await window.proxyCache.getOrCache(
                    video.id,
                    video.proxy_url,
                    {
                        projectId: this.project?.id,
                        filename: video.original_filename
                    }
                );
                if (cached) {
                    videoUrl = cached.url;
                    console.log(`📁 Playing from cache: ${video.original_filename}`);
                }
            }

            // Load video
            this.elements.videoPlayer.src = videoUrl;
            this.elements.videoPlayer.load();
        } catch (error) {
            console.error('Error loading video:', error);
            // Fallback to direct URL
            this.elements.videoPlayer.src = video.proxy_url;
            this.elements.videoPlayer.load();
        }

        // Update list
        this.renderVideosList();
        this.renderMarks();
    }

    onVideoLoaded() {
        this.elements.videoLoading.classList.add('hidden');
        this.elements.duration.textContent = this.formatTime(this.elements.videoPlayer.duration);
        this.elements.videoPlayer.play();
        this.renderTimelineMarks();
    }

    togglePlayPause() {
        const player = this.elements.videoPlayer;
        if (player.paused) {
            player.play();
        } else {
            player.pause();
        }
    }

    skip(seconds) {
        const player = this.elements.videoPlayer;
        player.currentTime = Math.max(0, Math.min(player.duration, player.currentTime + seconds));
    }

    updateTimeline() {
        const player = this.elements.videoPlayer;
        const progress = (player.currentTime / player.duration) * 100 || 0;
        this.elements.timelineProgress.style.width = `${progress}%`;
        this.elements.currentTime.textContent = this.formatTime(player.currentTime);
    }

    seekToPosition(e) {
        const rect = this.elements.timeline.getBoundingClientRect();
        const position = (e.clientX - rect.left) / rect.width;
        this.elements.videoPlayer.currentTime = position * this.elements.videoPlayer.duration;
    }

    // ==========================================
    // Marks
    // ==========================================

    setInPoint() {
        if (!this.activeVideoId) {
            this.showToast('Nejprve vyberte video', 'error');
            return;
        }
        this.currentInPoint = this.elements.videoPlayer.currentTime;
        this.showToast(`In: ${this.formatTime(this.currentInPoint)}`);
        this.elements.btnInPoint.style.background = 'var(--accent-secondary)';
    }

    async setOutPoint() {
        if (!this.activeVideoId) {
            this.showToast('Nejprve vyberte video', 'error');
            return;
        }

        if (this.currentInPoint === null) {
            this.showToast('Nejprve nastavte In point', 'error');
            return;
        }

        const outPoint = this.elements.videoPlayer.currentTime;
        if (outPoint <= this.currentInPoint) {
            this.showToast('Out point musí být po In pointu', 'error');
            return;
        }

        try {
            const response = await fetch(`/api/videos/${this.activeVideoId}/marks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    in_point: this.currentInPoint,
                    out_point: outPoint
                })
            });

            const data = await response.json();

            if (data.success) {
                // Update local state
                const video = this.videos.find(v => v.id === this.activeVideoId);
                if (video) {
                    if (!video.marks) video.marks = [];
                    video.marks.push(data.mark);
                }

                this.currentInPoint = null;
                this.elements.btnInPoint.style.background = '';
                this.renderMarks();
                this.renderTimelineMarks();
                this.renderVideosList();

                const duration = outPoint - data.mark.in_point;
                this.showToast(`Značka přidána (${this.formatDuration(duration)})`);
            }
        } catch (error) {
            this.showToast('Chyba při ukládání značky', 'error');
        }
    }

    async deleteMark(markId) {
        try {
            await fetch(`/api/marks/${markId}`, { method: 'DELETE' });

            const video = this.videos.find(v => v.id === this.activeVideoId);
            if (video && video.marks) {
                video.marks = video.marks.filter(m => m.id !== markId);
            }

            this.renderMarks();
            this.renderTimelineMarks();
            this.renderVideosList();
        } catch (error) {
            this.showToast('Chyba při mazání značky', 'error');
        }
    }

    renderMarks() {
        const video = this.videos.find(v => v.id === this.activeVideoId);

        if (!video || !video.marks || video.marks.length === 0) {
            this.elements.marksContainer.innerHTML = '<p class="no-marks">Žádné značky</p>';
            return;
        }

        this.elements.marksContainer.innerHTML = video.marks.map(mark => {
            const duration = mark.out_point - mark.in_point;
            return `
                <div class="mark-item">
                    <span class="mark-times">${this.formatTime(mark.in_point)} → ${this.formatTime(mark.out_point)}</span>
                    <span class="mark-duration">(${this.formatDuration(duration)})</span>
                    <button class="mark-delete" data-id="${mark.id}" title="Smazat">✕</button>
                </div>
            `;
        }).join('');

        this.elements.marksContainer.querySelectorAll('.mark-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteMark(btn.dataset.id);
            });
        });
    }

    renderTimelineMarks() {
        const video = this.videos.find(v => v.id === this.activeVideoId);
        const duration = this.elements.videoPlayer.duration;

        if (!video || !video.marks || video.marks.length === 0 || !duration) {
            this.elements.timelineMarks.innerHTML = '';
            return;
        }

        this.elements.timelineMarks.innerHTML = video.marks.map(mark => {
            const left = (mark.in_point / duration) * 100;
            const width = ((mark.out_point - mark.in_point) / duration) * 100;
            return `<div class="timeline-mark" style="left: ${left}%; width: ${width}%;"></div>`;
        }).join('');
    }

    // ==========================================
    // Export
    // ==========================================

    showExportModal() {
        const readyVideos = this.videos.filter(v => v.processing_status === 'ready' && v.included);
        const totalMarks = readyVideos.reduce((sum, v) => sum + (v.marks?.length || 0), 0);

        let totalDuration = 0;
        readyVideos.forEach(v => {
            if (v.marks && v.marks.length > 0) {
                v.marks.forEach(m => totalDuration += (m.out_point - m.in_point));
            } else if (v.duration) {
                totalDuration += v.duration;
            }
        });

        this.elements.exportSummary.innerHTML = `
            <p><strong>Videí k exportu:</strong> ${readyVideos.length}</p>
            <p><strong>Celkem značek:</strong> ${totalMarks}</p>
            <p><strong>Odhadovaná délka:</strong> ${this.formatDuration(totalDuration)}</p>
            <p style="margin-top: 10px; color: var(--text-muted); font-size: 12px;">
                ${totalMarks > 0
                ? 'Budou použity pouze označené části videí.'
                : 'Budou použita celá videa (žádné značky nastaveny).'}
            </p>
        `;

        this.elements.exportName.value = this.project?.name?.replace(/\s+/g, '_').toLowerCase() || 'export';
        this.elements.exportModal.classList.add('visible');
    }

    hideExportModal() {
        this.elements.exportModal.classList.remove('visible');
    }

    async startExport() {
        const name = this.elements.exportName.value.trim() || 'export';
        this.hideExportModal();

        try {
            const response = await fetch(`/api/projects/${this.project.id}/export`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });

            const data = await response.json();

            if (data.success) {
                this.showExportProgress(data.exportId);
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            this.showToast('Chyba při spuštění exportu: ' + error.message, 'error');
        }
    }

    showExportProgress(exportId) {
        this.elements.exportProgressModal.classList.add('visible');
        this.elements.exportProgressFill.style.width = '0%';
        this.elements.exportProgressText.textContent = 'Připravuji export...';

        this.pollExportStatus(exportId);
    }

    async pollExportStatus(exportId) {
        try {
            const response = await fetch(`/api/exports/${exportId}`);
            const data = await response.json();

            if (data.success) {
                const exp = data.export;

                this.elements.exportProgressFill.style.width = `${exp.progress}%`;

                if (exp.status === 'ready') {
                    this.elements.exportProgressModal.classList.remove('visible');
                    this.showToast('Export dokončen!');

                    if (exp.download_url) {
                        window.open(exp.download_url, '_blank');
                    }
                } else if (exp.status === 'failed') {
                    this.elements.exportProgressModal.classList.remove('visible');
                    this.showToast('Export selhal: ' + (exp.error_message || 'Neznámá chyba'), 'error');
                } else {
                    this.elements.exportProgressText.textContent = `Zpracovávám... ${exp.progress}%`;
                    setTimeout(() => this.pollExportStatus(exportId), 2000);
                }
            }
        } catch (error) {
            console.error('Poll error:', error);
            setTimeout(() => this.pollExportStatus(exportId), 5000);
        }
    }

    // ==========================================
    // Keyboard Shortcuts
    // ==========================================

    handleKeyboard(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const player = this.elements.videoPlayer;

        switch (e.key.toLowerCase()) {
            case ' ':
                e.preventDefault();
                this.togglePlayPause();
                break;
            case 'i':
                e.preventDefault();
                this.setInPoint();
                break;
            case 'o':
                e.preventDefault();
                this.setOutPoint();
                break;
            case 'arrowleft':
                e.preventDefault();
                this.skip(-5);
                break;
            case 'arrowright':
                e.preventDefault();
                this.skip(5);
                break;
            case 'j':
                e.preventDefault();
                this.skip(-10);
                break;
            case 'k':
                e.preventDefault();
                player.pause();
                break;
            case 'l':
                e.preventDefault();
                this.skip(10);
                break;
            case 'arrowup':
                e.preventDefault();
                this.selectPreviousVideo();
                break;
            case 'arrowdown':
                e.preventDefault();
                this.selectNextVideo();
                break;
        }
    }

    selectPreviousVideo() {
        const currentIndex = this.videos.findIndex(v => v.id === this.activeVideoId);
        const readyVideos = this.videos.filter(v => v.processing_status === 'ready');
        const currentReadyIndex = readyVideos.findIndex(v => v.id === this.activeVideoId);

        if (currentReadyIndex > 0) {
            this.playVideo(readyVideos[currentReadyIndex - 1].id);
        }
    }

    selectNextVideo() {
        const readyVideos = this.videos.filter(v => v.processing_status === 'ready');
        const currentReadyIndex = readyVideos.findIndex(v => v.id === this.activeVideoId);

        if (currentReadyIndex < readyVideos.length - 1) {
            this.playVideo(readyVideos[currentReadyIndex + 1].id);
        }
    }

    // ==========================================
    // Utilities
    // ==========================================

    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '00:00:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    formatDuration(seconds) {
        if (!seconds || isNaN(seconds)) return '00:00';
        if (seconds < 3600) {
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60);
            return `${m}:${s.toString().padStart(2, '0')}`;
        }
        return this.formatTime(seconds);
    }

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        this.elements.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideUp 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ==========================================
    // Storage / Cache Management
    // ==========================================

    async showStorageModal() {
        if (!window.proxyCache) {
            this.showToast('Cache není dostupná', 'error');
            return;
        }

        const stats = await window.proxyCache.getStorageStats();

        this.elements.cacheCount.textContent = stats.totalCount;
        this.elements.cacheSize.textContent = stats.totalSizeFormatted;

        // Render cached items list
        if (stats.items.length === 0) {
            this.elements.cachedList.innerHTML = '<p class="no-cache">Žádná stažená videa</p>';
        } else {
            this.elements.cachedList.innerHTML = stats.items.map(item => `
                <div class="cached-item">
                    <span class="cached-name">${item.filename}</span>
                    <span class="cached-size">${window.proxyCache.formatSize(item.size)}</span>
                    <button class="cached-delete" data-id="${item.videoId}">✕</button>
                </div>
            `).join('');

            // Bind delete events
            this.elements.cachedList.querySelectorAll('.cached-delete').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    await window.proxyCache.delete(btn.dataset.id);
                    this.showStorageModal(); // Refresh
                    this.showToast('Proxy odstraněno z cache');
                });
            });
        }

        this.elements.storageModal.classList.add('visible');
    }

    hideStorageModal() {
        this.elements.storageModal.classList.remove('visible');
    }

    async clearCache() {
        if (!window.proxyCache) return;

        if (confirm('Opravdu chcete vymazat všechna stažená proxy videa?')) {
            await window.proxyCache.clearAll();
            this.showStorageModal(); // Refresh
            this.showToast('Cache vymazána');
        }
    }
}

// Initialize app
const app = new VideoStitchApp();

