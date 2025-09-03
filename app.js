class RoomScanner3D {
    constructor() {
        this.video = document.getElementById('video');
        this.overlay = document.getElementById('overlay');
        this.overlayCtx = this.overlay.getContext('2d');
        
        // UI 요소들
        this.startBtn = document.getElementById('startBtn');
        this.scanBtn = document.getElementById('scanBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.exportBtn = document.getElementById('exportBtn');
        this.floorPlanBtn = document.getElementById('floorPlanBtn');
        this.status = document.getElementById('status');
        this.progress = document.getElementById('progress');
        this.pointCount = document.getElementById('pointCount');
        this.scanTime = document.getElementById('scanTime');
        this.roomSize = document.getElementById('roomSize');
        this.scanQuality = document.getElementById('scanQuality');
        
        // 3D 관련 변수들
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.pointCloud = null;
        this.points = [];
        this.depthData = [];
        
        // 스캔 상태
        this.isScanning = false;
        this.scanStartTime = null;
        this.frameCount = 0;
        
        // MediaPipe 관련
        this.selfieSegmentation = null;
        
        this.initializeEventListeners();
        this.initializeThreeJS();
    }
    
    initializeEventListeners() {
        this.startBtn.addEventListener('click', () => this.startCamera());
        this.scanBtn.addEventListener('click', () => this.startScanning());
        this.stopBtn.addEventListener('click', () => this.stopScanning());
        this.resetBtn.addEventListener('click', () => this.reset());
        this.exportBtn.addEventListener('click', () => this.exportModel());
        this.floorPlanBtn.addEventListener('click', () => this.generateFloorPlan());
        
        // 비디오 크기 조정
        this.video.addEventListener('loadedmetadata', () => {
            this.resizeCanvas();
        });
        
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    initializeThreeJS() {
        const container = document.getElementById('threejs-container');
        
        // Scene 생성
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);
        
        // Camera 생성
        this.camera = new THREE.PerspectiveCamera(
            75, 
            container.clientWidth / container.clientHeight, 
            0.1, 
            1000
        );
        this.camera.position.set(0, 5, 10);
        this.camera.lookAt(0, 0, 0);
        
        // Renderer 생성
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);
        
        // 조명 추가
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 10, 5);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
        
        // 기본 격자 추가
        const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
        this.scene.add(gridHelper);
        
        // 축 헬퍼 추가
        const axesHelper = new THREE.AxesHelper(5);
        this.scene.add(axesHelper);
        
        // 마우스 컨트롤 (간단한 궤도 컨트롤)
        this.setupMouseControls();
        
        this.animate();
    }
    
    setupMouseControls() {
        let isMouseDown = false;
        let mouseX = 0;
        let mouseY = 0;
        let targetRotationX = 0;
        let targetRotationY = 0;
        let rotationX = 0;
        let rotationY = 0;
        
        const container = this.renderer.domElement;
        
        container.addEventListener('mousedown', (event) => {
            isMouseDown = true;
            mouseX = event.clientX;
            mouseY = event.clientY;
        });
        
        container.addEventListener('mousemove', (event) => {
            if (isMouseDown) {
                const deltaX = event.clientX - mouseX;
                const deltaY = event.clientY - mouseY;
                
                targetRotationY += deltaX * 0.01;
                targetRotationX += deltaY * 0.01;
                
                mouseX = event.clientX;
                mouseY = event.clientY;
            }
        });
        
        container.addEventListener('mouseup', () => {
            isMouseDown = false;
        });
        
        container.addEventListener('wheel', (event) => {
            const distance = this.camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
            const newDistance = distance + event.deltaY * 0.01;
            
            if (newDistance > 2 && newDistance < 50) {
                const direction = this.camera.position.clone().normalize();
                this.camera.position.copy(direction.multiplyScalar(newDistance));
            }
        });
        
        // 부드러운 회전 애니메이션
        const updateRotation = () => {
            rotationX += (targetRotationX - rotationX) * 0.05;
            rotationY += (targetRotationY - rotationY) * 0.05;
            
            const radius = this.camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
            this.camera.position.x = Math.sin(rotationY) * Math.cos(rotationX) * radius;
            this.camera.position.y = Math.sin(rotationX) * radius;
            this.camera.position.z = Math.cos(rotationY) * Math.cos(rotationX) * radius;
            this.camera.lookAt(0, 0, 0);
            
            requestAnimationFrame(updateRotation);
        };
        updateRotation();
    }
    
    async startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'environment' // 후면 카메라 선호
                }
            });
            
            this.video.srcObject = stream;
            
            this.video.onloadedmetadata = () => {
                this.resizeCanvas();
                this.updateStatus('카메라가 준비되었습니다. 스캔을 시작하세요.', 'ready');
                this.startBtn.disabled = true;
                this.scanBtn.disabled = false;
            };
            
            // MediaPipe 초기화
            await this.initializeMediaPipe();
            
        } catch (error) {
            console.error('카메라 접근 오류:', error);
            this.updateStatus('카메라 접근에 실패했습니다. 권한을 확인해주세요.', 'ready');
        }
    }
    
    async initializeMediaPipe() {
        try {
            this.selfieSegmentation = new SelfieSegmentation({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
                }
            });
            
            this.selfieSegmentation.setOptions({
                modelSelection: 1, // 0 for general, 1 for landscape
            });
            
            this.selfieSegmentation.onResults((results) => {
                this.processDepthResults(results);
            });
            
            console.log('MediaPipe 초기화 완료');
        } catch (error) {
            console.error('MediaPipe 초기화 오류:', error);
        }
    }
    
    resizeCanvas() {
        if (this.video.videoWidth && this.video.videoHeight) {
            this.overlay.width = this.video.clientWidth;
            this.overlay.height = this.video.clientHeight;
        }
    }
    
    startScanning() {
        this.isScanning = true;
        this.scanStartTime = Date.now();
        this.frameCount = 0;
        this.points = [];
        this.depthData = [];
        
        this.updateStatus('스캔 중... 방 안을 천천히 둘러보세요', 'scanning');
        this.scanBtn.disabled = true;
        this.stopBtn.disabled = false;
        
        this.scanLoop();
    }
    
    stopScanning() {
        this.isScanning = false;
        this.updateStatus('스캔 완료! 3D 모델을 처리 중입니다...', 'processing');
        this.stopBtn.disabled = true;
        this.scanBtn.disabled = false;
        
        setTimeout(() => {
            this.processPointCloud();
            this.updateStatus('3D 모델이 생성되었습니다', 'ready');
            this.exportBtn.disabled = false;
            this.floorPlanBtn.disabled = false;
        }, 1000);
    }
    
    scanLoop() {
        if (!this.isScanning) return;
        
        // 프레임 처리
        if (this.video.readyState === 4) {
            this.processFrame();
            this.frameCount++;
            
            // 진행률 업데이트 (임의로 30초 기준)
            const elapsed = (Date.now() - this.scanStartTime) / 1000;
            const progress = Math.min((elapsed / 30) * 100, 95);
            this.progress.style.width = `${progress}%`;
            
            // 스캔 시간 업데이트
            this.scanTime.textContent = this.formatTime(elapsed);
        }
        
        requestAnimationFrame(() => this.scanLoop());
    }
    
    processFrame() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;
        
        ctx.drawImage(this.video, 0, 0);
        
        // MediaPipe로 깊이 추정 (실제로는 segmentation만 가능)
        if (this.selfieSegmentation) {
            this.selfieSegmentation.send({ image: this.video });
        }
        
        // 임시로 랜덤 포인트 생성 (실제 깊이 데이터 대신)
        this.generateMockDepthPoints();
        
        this.drawOverlay();
    }
    
    generateMockDepthPoints() {
        // 실제 구현에서는 스테레오 비전이나 다른 깊이 추정 기법 사용
        const numPoints = 50;
        
        for (let i = 0; i < numPoints; i++) {
            const x = (Math.random() - 0.5) * 10;
            const y = (Math.random() - 0.5) * 6;
            const z = (Math.random() - 0.5) * 10;
            
            // 방의 경계를 시뮬레이션
            if (Math.abs(x) > 4 || Math.abs(z) > 4 || Math.abs(y) > 2.5) {
                this.points.push(new THREE.Vector3(x, y, z));
            }
        }
        
        this.pointCount.textContent = this.points.length.toLocaleString();
    }
    
    processDepthResults(results) {
        // MediaPipe 결과 처리 (실제 깊이 데이터가 아닌 segmentation 결과)
        if (results.segmentationMask) {
            // segmentation 마스크를 이용해 깊이 추정 시뮬레이션
            this.overlayCtx.save();
            this.overlayCtx.clearRect(0, 0, this.overlay.width, this.overlay.height);
            
            // 마스크 시각화
            this.overlayCtx.globalCompositeOperation = 'source-over';
            this.overlayCtx.drawImage(results.segmentationMask, 0, 0, this.overlay.width, this.overlay.height);
            
            this.overlayCtx.restore();
        }
    }
    
    drawOverlay() {
        this.overlayCtx.clearRect(0, 0, this.overlay.width, this.overlay.height);
        
        // 스캔 영역 표시
        this.overlayCtx.strokeStyle = '#00ff00';
        this.overlayCtx.lineWidth = 2;
        this.overlayCtx.strokeRect(50, 50, this.overlay.width - 100, this.overlay.height - 100);
        
        // 중앙 십자선
        this.overlayCtx.beginPath();
        this.overlayCtx.moveTo(this.overlay.width / 2 - 20, this.overlay.height / 2);
        this.overlayCtx.lineTo(this.overlay.width / 2 + 20, this.overlay.height / 2);
        this.overlayCtx.moveTo(this.overlay.width / 2, this.overlay.height / 2 - 20);
        this.overlayCtx.lineTo(this.overlay.width / 2, this.overlay.height / 2 + 20);
        this.overlayCtx.stroke();
        
        // 스캔 정보 텍스트
        this.overlayCtx.fillStyle = '#00ff00';
        this.overlayCtx.font = '16px Arial';
        this.overlayCtx.fillText(`프레임: ${this.frameCount}`, 10, 30);
        this.overlayCtx.fillText(`포인트: ${this.points.length}`, 10, 50);
    }
    
    processPointCloud() {
        if (this.points.length === 0) return;
        
        // 기존 포인트 클라우드 제거
        if (this.pointCloud) {
            this.scene.remove(this.pointCloud);
        }
        
        // 새로운 포인트 클라우드 생성
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.points.length * 3);
        const colors = new Float32Array(this.points.length * 3);
        
        for (let i = 0; i < this.points.length; i++) {
            const point = this.points[i];
            positions[i * 3] = point.x;
            positions[i * 3 + 1] = point.y;
            positions[i * 3 + 2] = point.z;
            
            // 높이에 따른 색상 변화
            const hue = (point.y + 3) / 6; // -3 ~ 3을 0 ~ 1로 변환
            const color = new THREE.Color().setHSL(hue * 0.7, 0.8, 0.6);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const material = new THREE.PointsMaterial({
            size: 0.1,
            vertexColors: true,
            transparent: true,
            opacity: 0.8
        });
        
        this.pointCloud = new THREE.Points(geometry, material);
        this.scene.add(this.pointCloud);
        
        // 방 크기 계산
        this.calculateRoomSize();
        
        // 스캔 품질 평가
        this.evaluateScanQuality();
    }
    
    calculateRoomSize() {
        if (this.points.length === 0) return;
        
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        
        this.points.forEach(point => {
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
            minZ = Math.min(minZ, point.z);
            maxZ = Math.max(maxZ, point.z);
        });
        
        const width = (maxX - minX).toFixed(1);
        const height = (maxY - minY).toFixed(1);
        const depth = (maxZ - minZ).toFixed(1);
        
        this.roomSize.textContent = `${width}m × ${depth}m × ${height}m`;
    }
    
    evaluateScanQuality() {
        const pointDensity = this.points.length;
        let quality = '낮음';
        
        if (pointDensity > 5000) quality = '매우 높음';
        else if (pointDensity > 2000) quality = '높음';
        else if (pointDensity > 1000) quality = '보통';
        
        this.scanQuality.textContent = quality;
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        if (this.pointCloud) {
            this.pointCloud.rotation.y += 0.005;
        }
        
        this.renderer.render(this.scene, this.camera);
    }
    
    exportModel() {
        if (this.points.length === 0) {
            alert('스캔 데이터가 없습니다.');
            return;
        }
        
        // PLY 형식으로 내보내기
        let plyContent = `ply\nformat ascii 1.0\nelement vertex ${this.points.length}\n`;
        plyContent += 'property float x\nproperty float y\nproperty float z\n';
        plyContent += 'property uchar red\nproperty uchar green\nproperty uchar blue\n';
        plyContent += 'end_header\n';
        
        this.points.forEach(point => {
            const hue = (point.y + 3) / 6;
            const color = new THREE.Color().setHSL(hue * 0.7, 0.8, 0.6);
            const r = Math.floor(color.r * 255);
            const g = Math.floor(color.g * 255);
            const b = Math.floor(color.b * 255);
            
            plyContent += `${point.x.toFixed(3)} ${point.y.toFixed(3)} ${point.z.toFixed(3)} ${r} ${g} ${b}\n`;
        });
        
        const blob = new Blob([plyContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `room_scan_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.ply`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    generateFloorPlan() {
        if (this.points.length === 0) {
            alert('스캔 데이터가 없습니다.');
            return;
        }
        
        // 2D 도면 생성을 위한 새 창 열기
        const floorPlanWindow = window.open('', '_blank', 'width=800,height=600');
        
        const floorPlanHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>방 도면</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                canvas { border: 2px solid #333; background: white; }
                .info { margin-top: 20px; }
            </style>
        </head>
        <body>
            <h1>생성된 방 도면</h1>
            <canvas id="floorplan" width="600" height="400"></canvas>
            <div class="info">
                <h3>도면 정보</h3>
                <p>스캔 포인트 수: ${this.points.length.toLocaleString()}</p>
                <p>생성 시간: ${new Date().toLocaleString()}</p>
            </div>
            <script>
                const canvas = document.getElementById('floorplan');
                const ctx = canvas.getContext('2d');
                
                // 간단한 방 도면 그리기
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 3;
                ctx.strokeRect(50, 50, 500, 300);
                
                // 문 표시
                ctx.beginPath();
                ctx.moveTo(250, 350);
                ctx.lineTo(300, 350);
                ctx.lineWidth = 5;
                ctx.strokeStyle = '#8B4513';
                ctx.stroke();
                
                // 창문 표시
                ctx.beginPath();
                ctx.moveTo(100, 50);
                ctx.lineTo(200, 50);
                ctx.lineWidth = 3;
                ctx.strokeStyle = '#4169E1';
                ctx.stroke();
                
                // 치수 표시
                ctx.fillStyle = '#000';
                ctx.font = '14px Arial';
                ctx.fillText('${this.roomSize.textContent}', 250, 30);
                ctx.fillText('문', 270, 370);
                ctx.fillText('창문', 130, 40);
                
                // 북쪽 표시
                ctx.beginPath();
                ctx.moveTo(580, 30);
                ctx.lineTo(580, 10);
                ctx.moveTo(575, 15);
                ctx.lineTo(580, 10);
                ctx.lineTo(585, 15);
                ctx.stroke();
                ctx.fillText('N', 575, 45);
            </script>
        </body>
        </html>
        `;
        
        floorPlanWindow.document.write(floorPlanHTML);
        floorPlanWindow.document.close();
    }
    
    reset() {
        this.isScanning = false;
        this.points = [];
        this.depthData = [];
        this.frameCount = 0;
        
        if (this.pointCloud) {
            this.scene.remove(this.pointCloud);
            this.pointCloud = null;
        }
        
        this.progress.style.width = '0%';
        this.pointCount.textContent = '0';
        this.scanTime.textContent = '00:00';
        this.roomSize.textContent = '계산 중...';
        this.scanQuality.textContent = '대기 중';
        
        this.updateStatus('리셋 완료. 새로운 스캔을 시작하세요.', 'ready');
        
        this.startBtn.disabled = false;
        this.scanBtn.disabled = true;
        this.stopBtn.disabled = true;
        this.exportBtn.disabled = true;
        this.floorPlanBtn.disabled = true;
        
        // 비디오 스트림 중지
        if (this.video.srcObject) {
            const tracks = this.video.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            this.video.srcObject = null;
        }
        
        this.overlayCtx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    }
    
    updateStatus(message, type) {
        this.status.textContent = message;
        this.status.className = `status ${type}`;
    }
    
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

// 애플리케이션 시작
document.addEventListener('DOMContentLoaded', () => {
    new RoomScanner3D();
});
