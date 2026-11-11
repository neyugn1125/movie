"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface AudioDuckingProps {
  screenAudioStream: MediaStream | null;
  voiceAudioStream: MediaStream | null;
  localMicStream: MediaStream | null;
}

export function useAudioDucking({
  screenAudioStream,
  voiceAudioStream,
  localMicStream,
}: AudioDuckingProps) {
  const [filmVolume, setFilmVolume] = useState<number>(1.0); // 0.0 - 1.0
  const [voiceVolume, setVoiceVolume] = useState<number>(1.0); // 0.0 - 2.0
  const [autoDucking, setAutoDucking] = useState<boolean>(true);
  const [isPartnerSpeaking, setIsPartnerSpeaking] = useState<boolean>(false);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState<boolean>(false);

  const audioContextRef = useRef<AudioContext | null>(null);

  // Nodes for Screen / Film Audio
  const filmSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const filmGainRef = useRef<GainNode | null>(null);

  // Nodes for Remote Voice Audio
  const voiceSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const voiceGainRef = useRef<GainNode | null>(null);
  const voiceAnalyserRef = useRef<AnalyserNode | null>(null);

  // Local Voice Analyser (for local speaking indicator ring)
  const localAudioContextRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const localSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const duckingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Initialize or retrieve main AudioContext
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContextRef.current = new AudioCtx();
    }
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume().catch(() => {});
    }
    return audioContextRef.current;
  }, []);

  // Update Film Audio pipeline
  useEffect(() => {
    if (!screenAudioStream || screenAudioStream.getAudioTracks().length === 0) {
      if (filmSourceRef.current) {
        filmSourceRef.current.disconnect();
        filmSourceRef.current = null;
      }
      return;
    }

    const ctx = getAudioContext();
    try {
      if (filmSourceRef.current) {
        filmSourceRef.current.disconnect();
      }
      const source = ctx.createMediaStreamSource(screenAudioStream);
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(filmVolume, ctx.currentTime);

      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      filmSourceRef.current = source;
      filmGainRef.current = gainNode;
    } catch (e) {
      console.warn("Error setting up film audio node:", e);
    }

    return () => {
      if (filmSourceRef.current) {
        filmSourceRef.current.disconnect();
        filmSourceRef.current = null;
      }
    };
  }, [screenAudioStream, getAudioContext]);

  // Update Remote Voice Audio pipeline
  useEffect(() => {
    if (!voiceAudioStream || voiceAudioStream.getAudioTracks().length === 0) {
      if (voiceSourceRef.current) {
        voiceSourceRef.current.disconnect();
        voiceSourceRef.current = null;
      }
      return;
    }

    const ctx = getAudioContext();
    try {
      if (voiceSourceRef.current) {
        voiceSourceRef.current.disconnect();
      }
      const source = ctx.createMediaStreamSource(voiceAudioStream);
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(voiceVolume, ctx.currentTime);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;

      source.connect(gainNode);
      gainNode.connect(analyser);
      analyser.connect(ctx.destination);

      voiceSourceRef.current = source;
      voiceGainRef.current = gainNode;
      voiceAnalyserRef.current = analyser;
    } catch (e) {
      console.warn("Error setting up voice audio node:", e);
    }

    return () => {
      if (voiceSourceRef.current) {
        voiceSourceRef.current.disconnect();
        voiceSourceRef.current = null;
      }
    };
  }, [voiceAudioStream, getAudioContext]);

  // Adjust volume gains dynamically
  useEffect(() => {
    if (filmGainRef.current && audioContextRef.current) {
      // If ducking is active, apply ducked volume
      const currentTarget = isPartnerSpeaking && autoDucking ? filmVolume * 0.35 : filmVolume;
      filmGainRef.current.gain.setTargetAtTime(currentTarget, audioContextRef.current.currentTime, 0.1);
    }
  }, [filmVolume, isPartnerSpeaking, autoDucking]);

  useEffect(() => {
    if (voiceGainRef.current && audioContextRef.current) {
      voiceGainRef.current.gain.setTargetAtTime(voiceVolume, audioContextRef.current.currentTime, 0.05);
    }
  }, [voiceVolume]);

  // Partner voice activity detection (Smart Audio Ducking)
  useEffect(() => {
    if (!voiceAnalyserRef.current) return;

    const analyser = voiceAnalyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    let active = true;

    const checkVolume = () => {
      if (!active) return;
      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;

      // Threshold for voice detection
      if (average > 15) {
        setIsPartnerSpeaking(true);
        if (duckingTimeoutRef.current) {
          clearTimeout(duckingTimeoutRef.current);
        }
        duckingTimeoutRef.current = setTimeout(() => {
          setIsPartnerSpeaking(false);
        }, 1000); // 1-second hold time before restoring volume
      }

      animationFrameRef.current = requestAnimationFrame(checkVolume);
    };

    animationFrameRef.current = requestAnimationFrame(checkVolume);

    return () => {
      active = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (duckingTimeoutRef.current) clearTimeout(duckingTimeoutRef.current);
    };
  }, [voiceAudioStream]);

  // Local mic activity detection (for UI ring visualizer)
  useEffect(() => {
    if (!localMicStream || localMicStream.getAudioTracks().length === 0) {
      setIsLocalSpeaking(false);
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      localAudioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(localMicStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      source.connect(analyser);
      localSourceRef.current = source;
      localAnalyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let localFrame: number;

      const checkLocalMic = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setIsLocalSpeaking(avg > 15);
        localFrame = requestAnimationFrame(checkLocalMic);
      };

      localFrame = requestAnimationFrame(checkLocalMic);

      return () => {
        cancelAnimationFrame(localFrame);
        source.disconnect();
        ctx.close().catch(() => {});
      };
    } catch (err) {
      console.warn("Could not setup local mic analyser:", err);
    }
  }, [localMicStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  return {
    filmVolume,
    setFilmVolume,
    voiceVolume,
    setVoiceVolume,
    autoDucking,
    setAutoDucking,
    isPartnerSpeaking,
    isLocalSpeaking,
    resumeAudioContext: getAudioContext,
  };
}
