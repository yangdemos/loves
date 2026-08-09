// ============================================
// Interactive 3D Globe - Three.js
// ============================================

let scene, camera, renderer, globe;
let globeGroup, markersGroup;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let autoRotate = true;
let pulseTime = 0;

function initGlobe() {
    const container = document.getElementById('globe-canvas');
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    scene = new THREE.Scene();

    // Camera
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 3.5;

    // Renderer
    renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true 
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.5);
    dirLight.position.set(5, 3, 5);
    scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0x4488ff, 0.8);
    backLight.position.set(-3, -1, -5);
    scene.add(backLight);

    const rimLight = new THREE.DirectionalLight(0xc9a96e, 1.0);
    rimLight.position.set(0, 2, -4);
    scene.add(rimLight);

    // Create globe group
    globeGroup = new THREE.Group();
    scene.add(globeGroup);
    globeGroup.rotation.y = -0.5;

    // Create globe
    createGlobe();
    
    // Create markers
    markersGroup = new THREE.Group();
    globeGroup.add(markersGroup);
    createMarkers();

    // Starfield
    createStars();

    // Interaction
    setupInteraction(container);

    // Animation loop
    animateGlobe();

    // Resize
    window.addEventListener('resize', onGlobeResize);
}

function createGlobe() {
    // Earth sphere
    const geometry = new THREE.SphereGeometry(1.2, 64, 64);
    
    const textureLoader = new THREE.TextureLoader();
    const earthTexture = textureLoader.load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg');
    
    const material = new THREE.MeshPhongMaterial({
        map: earthTexture,
        specular: new THREE.Color(0x333333),
        shininess: 25,
        transparent: true,
        opacity: 0.92,
    });
    
    globe = new THREE.Mesh(geometry, material);
    globeGroup.add(globe);

    // Atmosphere glow
    const glowGeometry = new THREE.SphereGeometry(1.22, 48, 48);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0x4488ff,
        transparent: true,
        opacity: 0.08,
        side: THREE.BackSide,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    globeGroup.add(glow);

    // Subtle wireframe
    const wireGeo = new THREE.SphereGeometry(1.205, 24, 24);
    const wireMat = new THREE.MeshBasicMaterial({
        color: 0x4488ff,
        wireframe: true,
        transparent: true,
        opacity: 0.04,
    });
    const wire = new THREE.Mesh(wireGeo, wireMat);
    globeGroup.add(wire);
}

function createMarkers() {
    LOVE_DATA.locations.forEach((loc) => {
        const pos = latLngToPosition(loc.lat, loc.lng, 1.22);
        
        // Marker group
        const marker = new THREE.Group();
        marker.position.copy(pos);
        marker.userData = { locationId: loc.id };
        
        // Outer glow ring
        const ringGeo = new THREE.RingGeometry(0.025, 0.055, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(loc.color),
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.lookAt(new THREE.Vector3(0, 0, 0));
        marker.add(ring);

        // Inner dot
        const dotGeo = new THREE.SphereGeometry(0.018, 16, 16);
        const dotMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(loc.color),
        });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        marker.add(dot);

        // Pulse ring (animated)
        const pulseGeo = new THREE.RingGeometry(0.01, 0.02, 32);
        const pulseMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(loc.color),
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
        });
        const pulse = new THREE.Mesh(pulseGeo, pulseMat);
        pulse.lookAt(new THREE.Vector3(0, 0, 0));
        pulse.userData.isPulse = true;
        marker.add(pulse);

        // Connection line
        const linePoints = [
            new THREE.Vector3(0, 0, 0),
            pos.clone().multiplyScalar(0.95)
        ];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
        const lineMat = new THREE.LineBasicMaterial({
            color: new THREE.Color(loc.color),
            transparent: true,
            opacity: 0.08,
        });
        const line = new THREE.Line(lineGeo, lineMat);
        marker.add(line);

        markersGroup.add(marker);
    });
}

function latLngToPosition(lat, lng, radius) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;
    
    const x = -radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);
    
    return new THREE.Vector3(x, y, z);
}

function createStars() {
    const starsGeometry = new THREE.BufferGeometry();
    const starsCount = 2000;
    const positions = new Float32Array(starsCount * 3);
    
    for (let i = 0; i < starsCount * 3; i += 3) {
        const radius = 10 + Math.random() * 20;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        
        positions[i] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i + 1] = radius * Math.cos(phi);
        positions[i + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const starsMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.05,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
    });
    
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);
}

function setupInteraction(container) {
    // Pointer position when a drag/click started — used to tell a real
    // tap apart from a drag (a synthesized click fires after touchend/mouseup,
    // so checking isDragging alone can't suppress drag-triggered clicks).
    let pointerDown = null;

    container.addEventListener('mousedown', (e) => {
        isDragging = true;
        autoRotate = false;
        pointerDown = { x: e.clientX, y: e.clientY };
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;
            
            globeGroup.rotation.y += deltaX * 0.005;
            globeGroup.rotation.x += deltaY * 0.003;
            globeGroup.rotation.x = Math.max(-0.5, Math.min(0.5, globeGroup.rotation.x));
            
            previousMousePosition = { x: e.clientX, y: e.clientY };
        }
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        setTimeout(() => { if (!isDragging) autoRotate = true; }, 3000);
    });

    // Click to detect location.
    // Hit testing is done by projecting every marker onto the screen and
    // picking the nearest one within a tap radius. A plain raycaster shoots
    // straight through the globe, so a tap on empty ocean can open a city on
    // the far side, and nearby cities overlap badly on small screens.
    container.addEventListener('click', (e) => {
        // Suppress the click that follows an actual drag (mouse or touch).
        if (pointerDown) {
            const dx = e.clientX - pointerDown.x;
            const dy = e.clientY - pointerDown.y;
            pointerDown = null;
            if (Math.sqrt(dx * dx + dy * dy) > 10) return;
        }
        if (isDragging) return;

        const rect = container.getBoundingClientRect();
        const tapScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        // Tap radius scales with the globe size (min 28px so small markers stay tappable).
        const threshold = Math.max(28, rect.width * 0.045);

        let bestMarker = null;
        let bestDist = Infinity;
        const tmpPos = new THREE.Vector3();

        markersGroup.children.forEach(marker => {
            // Skip markers on the far side of the globe.
            const worldPos = marker.getWorldPosition(tmpPos);
            const toCamera = new THREE.Vector3().subVectors(camera.position, worldPos).normalize();
            if (worldPos.clone().normalize().dot(toCamera) < 0.1) return;

            const projected = worldPos.clone().project(camera);
            const sx = (projected.x + 1) / 2 * rect.width;
            const sy = (1 - projected.y) / 2 * rect.height;
            const dist = Math.hypot(sx - tapScreen.x, sy - tapScreen.y);
            if (dist < threshold && dist < bestDist) {
                bestDist = dist;
                bestMarker = marker;
            }
        });

        if (bestMarker && bestMarker.userData.locationId && window.openLocationModal) {
            window.openLocationModal(bestMarker.userData.locationId);
        }
    });

    // Touch support
    let touchStartX = 0, touchStartY = 0;
    container.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        pointerDown = { x: touch.clientX, y: touch.clientY };
        isDragging = true;
        autoRotate = false;
    });

    container.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const touch = e.touches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        
        globeGroup.rotation.y += deltaX * 0.005;
        globeGroup.rotation.x += deltaY * 0.003;
        globeGroup.rotation.x = Math.max(-0.5, Math.min(0.5, globeGroup.rotation.x));
        
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
    });

    container.addEventListener('touchend', () => {
        isDragging = false;
        setTimeout(() => { if (!isDragging) autoRotate = true; }, 3000);
    });
}

function animateGlobe() {
    requestAnimationFrame(animateGlobe);
    
    pulseTime += 0.02;
    
    if (autoRotate && !isDragging) {
        globeGroup.rotation.y += 0.002;
    }
    
    // Subtle floating
    globeGroup.position.y = Math.sin(Date.now() * 0.0005) * 0.05;
    
    // Animate markers
    markersGroup.children.forEach((marker, i) => {
        marker.children.forEach(child => {
            if (child.userData && child.userData.isPulse) {
                const scale = 1 + Math.sin(pulseTime + i * 1.5) * 0.5 + 0.5;
                child.scale.set(scale, scale, scale);
                child.material.opacity = Math.max(0, 0.6 - (scale - 1) * 0.4);
            }
        });
        
        // Orient markers toward center
        const direction = new THREE.Vector3(0, 0, 0).sub(marker.position);
        marker.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            direction.clone().normalize()
        );
    });
    
    renderer.render(scene, camera);
}

function onGlobeResize() {
    const container = document.getElementById('globe-canvas');
    if (!container) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

// Expose for main.js
function rotateGlobeToLocation(lat, lng) {
    const targetPhi = (90 - lat) * Math.PI / 180;
    const targetTheta = (lng + 180) * Math.PI / 180;
    
    const targetY = -targetTheta + Math.PI;
    const targetX = Math.PI - targetPhi;
    
    if (window.gsap) {
        gsap.to(globeGroup.rotation, {
            y: targetY,
            x: Math.min(0.3, Math.max(-0.3, Math.PI - targetPhi)),
            duration: 1.5,
            ease: 'power3.inOut',
            onComplete: () => { autoRotate = false; }
        });
    } else {
        globeGroup.rotation.y = targetY;
        globeGroup.rotation.x = Math.min(0.3, Math.max(-0.3, Math.PI - targetPhi));
    }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initGlobe, 500);
});
