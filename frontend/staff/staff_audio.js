/**
 * frontend/staff/staff_audio.js
 * ------------------------------
 * Web Audio API Emergency Siren Synthesizer for SignMetro Staff Dashboard.
 *
 * Generates an alternating two-tone emergency alarm (880Hz / 660Hz)
 * without requiring any external audio files.
 *
 * Handles browser autoplay policies with explicit arming / unlocking.
 */

"use strict";

const StaffAudio = (() => {
  let _audioCtx = null;
  let _oscillator = null;
  let _gainNode = null;
  let _isPlaying = false;
  let _timer = null;
  let _toneStep = 0;
  let _isArmed = false;
  let _volume = 0.35; // Default volume (0.0 to 1.0)

  function _initContext() {
    if (!_audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        _audioCtx = new AudioContextClass();
      }
    }
    if (_audioCtx && _audioCtx.state === "suspended") {
      _audioCtx.resume();
    }
  }

  /**
   * Arm / unlock audio via user interaction.
   */
  async function arm() {
    try {
      _initContext();
      if (_audioCtx) {
        await _audioCtx.resume();
        _isArmed = true;
        console.log("[StaffAudio] Web Audio context armed and unlocked.");
        return true;
      }
    } catch (err) {
      console.warn("[StaffAudio] Failed to arm audio context:", err);
    }
    return false;
  }

  /**
   * Start sounding the emergency siren continuously.
   */
  function startSiren() {
    if (_isPlaying) return;
    _initContext();
    if (!_audioCtx) return;

    try {
      _oscillator = _audioCtx.createOscillator();
      _gainNode = _audioCtx.createGain();

      _oscillator.type = "sawtooth";
      _oscillator.frequency.setValueAtTime(880, _audioCtx.currentTime);

      // Low pass filter for a smoother, warmer railway alarm tone
      const filter = _audioCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1400, _audioCtx.currentTime);

      _gainNode.gain.setValueAtTime(_volume, _audioCtx.currentTime);

      _oscillator.connect(filter);
      filter.connect(_gainNode);
      _gainNode.connect(_audioCtx.destination);

      _oscillator.start();
      _isPlaying = true;
      _toneStep = 0;

      // Two-tone warble (880Hz <-> 660Hz every 400ms)
      _timer = setInterval(() => {
        if (!_isPlaying || !_oscillator || !_audioCtx) return;
        _toneStep = 1 - _toneStep;
        const targetFreq = _toneStep === 0 ? 880 : 660;
        _oscillator.frequency.setTargetAtTime(targetFreq, _audioCtx.currentTime, 0.04);
      }, 380);

      console.log("[StaffAudio] 🚨 Emergency siren started.");
    } catch (err) {
      console.warn("[StaffAudio] Could not start siren:", err.message);
    }
  }

  /**
   * Silence the emergency siren.
   */
  function stopSiren() {
    if (!_isPlaying) return;

    if (_timer) {
      clearInterval(_timer);
      _timer = null;
    }

    if (_oscillator) {
      try {
        _oscillator.stop();
        _oscillator.disconnect();
      } catch (_) {}
      _oscillator = null;
    }

    if (_gainNode) {
      try {
        _gainNode.disconnect();
      } catch (_) {}
      _gainNode = null;
    }

    _isPlaying = false;
    console.log("[StaffAudio] Emergency siren stopped / silenced.");
  }

  /**
   * Play a brief 1-second sample test sound.
   */
  async function testBeep() {
    await arm();
    startSiren();
    setTimeout(() => {
      stopSiren();
    }, 1200);
  }

  /**
   * Adjust alarm master volume (0.0 to 1.0).
   */
  function setVolume(v) {
    _volume = Math.max(0, Math.min(1, parseFloat(v) || 0.35));
    if (_gainNode && _audioCtx) {
      _gainNode.gain.setTargetAtTime(_volume, _audioCtx.currentTime, 0.05);
    }
  }

  return {
    arm,
    startSiren,
    stopSiren,
    testBeep,
    setVolume,
    isPlaying: () => _isPlaying,
    isArmed: () => _isArmed,
  };
})();

window.StaffAudio = StaffAudio;
