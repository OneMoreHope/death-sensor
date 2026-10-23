/**
 * Real AirPods Pro Hardware Telemetry & Multi-Mode Motion Controller
 * 
 * Priority 1: Native macOS AirPods Bridge (http://127.0.0.1:8765) -> Reads Apple's CMHeadphoneMotionManager directly!
 * Priority 2: Webcam Head Tilt Tracking (headtrackr.js)
 * Priority 3: iOS Safari DeviceOrientation
 * Priority 4: Mouse & Keyboard fallback (A/D or Arrows)
 */
class MotionSensorController {
  constructor() {
    this.mode = 'idle';         // 'airpods_native', 'headtrackr', 'orientation', 'fallback'
    this.isConnected = false;
    
    // Raw attitude from AirPods (in degrees)
    this.rawRoll = 0;
    this.rawPitch = 0;
    this.rawYaw = 0;

    // Chosen axis: 'roll' (tilt ear to shoulder), 'yaw' (turn head left/right), or 'combined'
    this.trackingAxis = 'combined';

    // Calibration center offsets
    this.centerRoll = 0;
    this.centerYaw = 0;
    this.hasInitialCalibration = false;

    this.rawAngle = 0;          // Effective combined/selected angle
    this.centerAngle = 0;       // For headtrackr/orientation
    this.normalizedOffset = 0;  // -1.0 (far left) to +1.0 (far right)
    this.smoothedOffset = 0;    // Smoothed for crosshair rendering
    this.sensitivity = 22.0;    // Degrees needed for full left/right pan

    // Native Bridge polling
    this.bridgeUrl = 'http://127.0.0.1:8765/';
    this.isPollingBridge = false;
    this.lastBridgeTimestamp = 0;
    this.bridgeStaleTimer = 0;

    // Headtrackr instance
    this.htracker = null;
    this.videoElement = null;
    this.canvasElement = null;

    // Keyboard & Mouse fallback values
    this.keyboardOffset = 0;
    this.mouseOffset = 0;
    this.useMouseFallback = false;
    this.keysHeld = { left: false, right: false };

    // Smoothing factor (lerp)
    this.lerpSpeed = 0.25;

    this.initFallbackEvents();
    // Automatically start checking for the native macOS AirPods Bridge
    this.startNativeBridgePolling();
  }

  // Poll the local macOS Swift CoreMotion daemon at ~60Hz
  startNativeBridgePolling() {
    if (this.isPollingBridge) return;
    this.isPollingBridge = true;

    const poll = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 250);
        const res = await fetch(this.bridgeUrl, { 
          signal: controller.signal,
          cache: 'no-store'
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          this.handleBridgeData(data);
        }
      } catch (e) {
        // Bridge not reachable or timed out
      }
      setTimeout(poll, 25); // ~40Hz polling
    };

    poll();
  }

  handleBridgeData(data) {
    const statusText = document.getElementById('sensor-status-text');
    const camBadge = document.getElementById('cam-status-badge');

    if (data.status === 'connected' && data.active && data.ts > 0) {
      this.mode = 'airpods_native';
      this.isConnected = true;

      this.rawRoll = data.roll || 0;
      this.rawPitch = data.pitch || 0;
      this.rawYaw = data.yaw || 0;

      // Auto-calibrate on first valid packet
      if (!this.hasInitialCalibration) {
        this.centerRoll = this.rawRoll;
        this.centerYaw = this.rawYaw;
        this.hasInitialCalibration = true;
      }

      // Calculate delta from center
      // Roll: tilting head left/right
      // Yaw: turning head left/right (Note: yaw is usually positive left, negative right in CoreMotion)
      const deltaRoll = this.rawRoll - this.centerRoll;
      const deltaYaw = -(this.rawYaw - this.centerYaw);

      let effectiveDelta = 0;
      if (this.trackingAxis === 'roll') {
        effectiveDelta = deltaRoll;
      } else if (this.trackingAxis === 'yaw') {
        effectiveDelta = deltaYaw;
      } else {
        // Combined: reacts to both tilting head (roll) and turning head (yaw)!
        effectiveDelta = deltaRoll + (deltaYaw * 0.85);
      }

      this.rawAngle = effectiveDelta;
      const clamped = Math.max(-this.sensitivity, Math.min(this.sensitivity, effectiveDelta));
      this.normalizedOffset = clamped / this.sensitivity;

      if (statusText) {
        statusText.className = 'status-connected';
        statusText.innerHTML = `🎧 <strong>AIRPODS PRO CONNECTED!</strong> (Roll: ${deltaRoll.toFixed(1)}° | Yaw: ${deltaYaw.toFixed(1)}°)`;
      }
      if (camBadge) {
        camBadge.textContent = "AIRPODS: LIVE";
      }
    } else if (data.status === 'starting' || data.status === 'disconnected') {
      if (this.mode !== 'headtrackr') {
        if (statusText) {
          statusText.className = 'status-neutral';
          statusText.innerHTML = `🎧 AirPods Bridge Ready — <strong>Put at least 1 AirPod in your ear</strong> (In-Ear Detection ON)`;
        }
        if (camBadge) {
          camBadge.textContent = "WAIT IN-EAR";
        }
      }
    } else if (data.status === 'error') {
      if (statusText) {
        statusText.className = 'status-neutral';
        statusText.textContent = `AirPods Permission Needed: Check System Settings > Privacy & Security > Motion & Fitness`;
      }
    }
  }

  // Triggered when user clicks the Connect Sensor button
  async connectSensor() {
    const statusText = document.getElementById('sensor-status-text');
    try {
      // 1. Check Native AirPods Bridge first
      const res = await fetch(this.bridgeUrl, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        this.handleBridgeData(data);

        if (data.status === 'connected' && data.active) {
          this.calibrateCenter();
          return {
            success: true,
            message: "🎧 AirPods Pro Motion Connected! Tilt or turn your head to aim."
          };
        } else {
          return {
            success: true,
            message: "🎧 Bridge active! Put AirPods Pro in your ear (and play audio/unmute) to wake up the sensor."
          };
        }
      }
    } catch (e) {
      // Bridge not running, fallback to Webcam / Orientation
    }

    // 2. Fallback to Webcam Head Tracking or iOS Orientation
    return await this.startWebcamHeadTracking();
  }

  async startWebcamHeadTracking() {
    const statusText = document.getElementById('sensor-status-text');
    try {
      this.videoElement = document.getElementById('headtrackr-video');
      this.canvasElement = document.getElementById('headtrackr-canvas');

      if (!this.videoElement || !this.canvasElement || typeof headtrackr === 'undefined') {
        return this.requestOrientationPermission();
      }

      if (statusText) {
        statusText.className = "status-neutral";
        statusText.textContent = "Starting camera & face detector...";
      }

      this.htracker = new headtrackr.Tracker({
        calcAngles: true,
        ui: false,
        headPosition: true,
        smoothing: true,
        detectionInterval: 25
      });

      this.htracker.init(this.videoElement, this.canvasElement);

      document.addEventListener('facetrackingEvent', (e) => {
        if (this.mode === 'airpods_native') return; // Prefer real AirPods IMU if active
        if (e.angle !== undefined && e.angle !== null) {
          const rad = e.angle - (Math.PI / 2);
          const angleDeg = rad * (180 / Math.PI);

          this.rawAngle = -angleDeg;
          this.isConnected = true;
          this.mode = 'headtrackr';

          const delta = this.rawAngle - this.centerAngle;
          const clamped = Math.max(-this.sensitivity, Math.min(this.sensitivity, delta));
          this.normalizedOffset = clamped / this.sensitivity;
        }
      });

      document.addEventListener('headtrackrStatus', (e) => {
        if (this.mode === 'airpods_native') return;
        if (e.status === 'tracking') {
          this.isConnected = true;
          this.mode = 'headtrackr';
          if (statusText) {
            statusText.className = "status-connected";
            statusText.textContent = "📷 Camera Head Tracking Active! Tilt your head left/right.";
          }
          const camBadge = document.getElementById('cam-status-badge');
          if (camBadge) camBadge.textContent = "CAM TRACK: ON";
        }
      });

      this.htracker.start();
      return {
        success: true,
        message: "Head tracking started! Tilt your head left/right."
      };
    } catch (err) {
      return this.requestOrientationPermission();
    }
  }

  async requestOrientationPermission() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && 
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        const response = await DeviceOrientationEvent.requestPermission();
        if (response === 'granted') {
          this.bindOrientationEvent();
          return { success: true, message: "iOS Motion connected!" };
        }
      } else if ('ondeviceorientation' in window) {
        this.bindOrientationEvent();
        return { success: true, message: "Motion listener active!" };
      }
      return { success: false, message: "Using Mouse / Keyboard controls." };
    } catch (err) {
      return { success: false, message: "Sensor error: " + err.message };
    }
  }

  bindOrientationEvent() {
    window.addEventListener('deviceorientation', (e) => {
      if (this.mode === 'airpods_native' || this.mode === 'headtrackr') return;
      let tilt = e.gamma !== null ? e.gamma : (e.beta || 0);
      this.rawAngle = tilt;
      this.isConnected = true;
      this.mode = 'orientation';

      const delta = this.rawAngle - this.centerAngle;
      const clamped = Math.max(-this.sensitivity, Math.min(this.sensitivity, delta));
      this.normalizedOffset = clamped / this.sensitivity;
    }, true);
  }

  calibrateCenter() {
    this.centerRoll = this.rawRoll;
    this.centerYaw = this.rawYaw;
    this.centerAngle = this.rawAngle;
    this.keyboardOffset = 0;
    this.mouseOffset = 0;
    this.normalizedOffset = 0;
  }

  initFallbackEvents() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
        this.keysHeld.left = true;
      } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
        this.keysHeld.right = true;
      } else if (e.code === 'KeyC') {
        // Press C anytime to re-center AirPods!
        this.calibrateCenter();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
        this.keysHeld.left = false;
      } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
        this.keysHeld.right = false;
      }
    });

    window.addEventListener('mousemove', (e) => {
      const w = window.innerWidth;
      this.mouseOffset = (e.clientX / w) * 2 - 1;
      this.useMouseFallback = true;
    });
  }

  update(dt = 0.016) {
    let targetOffset = 0;

    // Allow keyboard override if actively held, otherwise use AirPods sensor
    const kbSpeed = 2.5;
    if (this.keysHeld.left) {
      this.keyboardOffset = Math.max(-1.0, this.keyboardOffset - kbSpeed * dt);
      targetOffset = this.keyboardOffset;
    } else if (this.keysHeld.right) {
      this.keyboardOffset = Math.min(1.0, this.keyboardOffset + kbSpeed * dt);
      targetOffset = this.keyboardOffset;
    } else if (this.isConnected) {
      targetOffset = this.normalizedOffset;
    } else if (this.useMouseFallback) {
      targetOffset = Math.max(-1.0, Math.min(1.0, this.mouseOffset));
    }

    // Apply tiny deadzone
    if (Math.abs(targetOffset) < 0.015) {
      targetOffset = 0;
    }

    // Smooth Lerp
    this.smoothedOffset += (targetOffset - this.smoothedOffset) * this.lerpSpeed;

    // Update UI PIP
    const pip = document.getElementById('sensor-pip');
    if (pip) {
      const pct = (this.smoothedOffset + 1) * 50;
      pip.style.left = `${Math.max(5, Math.min(95, pct))}%`;
    }

    return this.smoothedOffset;
  }
}

window.motionSensor = new MotionSensorController();
