import { useEffect, useRef, useState } from "react";
import { connectSocket } from "./socket";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

type SignalPayload =
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; candidate: RTCIceCandidateInit | null };

type Options = {
  enabled: boolean;
  matchId: string | null;
  /** Player "a" creates the offer. */
  role: "a" | "b" | null;
  /** Local camera stream (video). Mic is requested separately for voice. */
  localVideoStream: MediaStream | null;
};

function sdpInit(desc: RTCSessionDescription | null): RTCSessionDescriptionInit {
  return { type: desc!.type, sdp: desc!.sdp };
}

/**
 * WebRTC A/V between matched dancers. Signaling rides the existing Socket.IO channel.
 */
export function useBattleRtc({
  enabled,
  matchId,
  role,
  localVideoStream,
}: Options) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<"off" | "connecting" | "live" | "error">(
    "off"
  );
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const clonedTracksRef = useRef<MediaStreamTrack[]>([]);

  useEffect(() => {
    if (!enabled || !matchId || !role || !localVideoStream) {
      return;
    }

    let cancelled = false;
    const socket = connectSocket();
    const remote = new MediaStream();
    setRemoteStream(remote);
    setStatus("connecting");
    setError(null);

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    pc.ontrack = (ev) => {
      const track = ev.track;
      if (!remote.getTracks().some((t) => t.id === track.id)) {
        remote.addTrack(track);
      }
      setRemoteStream(new MediaStream(remote.getTracks()));
      setStatus("live");
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setStatus("live");
      if (pc.connectionState === "failed") {
        setStatus("error");
        setError("Peer connection failed");
      }
    };

    pc.onicecandidate = (ev) => {
      socket.emit("webrtc:signal", {
        matchId,
        signal: {
          type: "ice",
          candidate: ev.candidate ? ev.candidate.toJSON() : null,
        } satisfies SignalPayload,
      });
    };

    async function addLocalTracks() {
      const outbound = new MediaStream();
      for (const track of localVideoStream!.getVideoTracks()) {
        const cloned = track.clone();
        clonedTracksRef.current.push(cloned);
        outbound.addTrack(cloned);
        pc.addTrack(cloned, outbound);
      }
      try {
        const audio = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
          video: false,
        });
        if (cancelled) {
          audio.getTracks().forEach((t) => t.stop());
          return;
        }
        audioStreamRef.current = audio;
        for (const track of audio.getAudioTracks()) {
          pc.addTrack(track, audio);
        }
      } catch (err) {
        console.warn("Battle voice unavailable:", err);
      }
    }

    async function makeOffer() {
      if (role !== "a" || cancelled) return;
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);
        socket.emit("webrtc:signal", {
          matchId,
          signal: {
            type: "offer",
            sdp: sdpInit(pc.localDescription),
          } satisfies SignalPayload,
        });
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "WebRTC offer failed");
        setStatus("error");
      }
    }

    async function onSignal(payload: {
      matchId?: string;
      signal?: SignalPayload;
    }) {
      if (cancelled || payload.matchId !== matchId || !payload.signal) return;
      const signal = payload.signal;
      try {
        if (signal.type === "offer") {
          if (role !== "b") return;
          await pc.setRemoteDescription(signal.sdp);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("webrtc:signal", {
            matchId,
            signal: {
              type: "answer",
              sdp: sdpInit(pc.localDescription),
            } satisfies SignalPayload,
          });
        } else if (signal.type === "answer") {
          if (role !== "a") return;
          if (!pc.currentRemoteDescription) {
            await pc.setRemoteDescription(signal.sdp);
          }
        } else if (signal.type === "ice" && signal.candidate) {
          try {
            await pc.addIceCandidate(signal.candidate);
          } catch (err) {
            console.warn("ICE add failed", err);
          }
        }
      } catch (err) {
        console.error("webrtc signal error", err);
        setError(err instanceof Error ? err.message : "WebRTC signal failed");
        setStatus("error");
      }
    }

    socket.on("webrtc:signal", onSignal);

    void (async () => {
      await addLocalTracks();
      if (cancelled) return;
      await new Promise((r) => setTimeout(r, 500));
      if (!cancelled) await makeOffer();
    })();

    return () => {
      cancelled = true;
      socket.off("webrtc:signal", onSignal);
      pcRef.current = null;
      try {
        pc.close();
      } catch {
        /* ignore */
      }
      audioStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
      clonedTracksRef.current.forEach((t) => t.stop());
      clonedTracksRef.current = [];
      setRemoteStream(null);
      setStatus("off");
    };
  }, [enabled, matchId, role, localVideoStream]);

  return { remoteStream, status, error };
}
