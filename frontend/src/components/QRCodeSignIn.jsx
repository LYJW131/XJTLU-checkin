import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const QRCodeSignIn = ({ isActive, selectedUsers }) => {
    const [loading, setLoading] = useState(false);
    const [scanStarted, setScanStarted] = useState(false);
    const [message, setMessage] = useState(null);
    const [status, setStatus] = useState('');
    const [results, setResults] = useState([]);
    const [zoom, setZoom] = useState(1);
    const [zoomCapability, setZoomCapability] = useState(null);
    const scannerRef = useRef(null);
    const fileInputRef = useRef(null);
    const touchStartDist = useRef(null);
    const startZoom = useRef(1);
    const selectedUsersRef = useRef(selectedUsers);

    // Sync ref with latest prop
    useEffect(() => {
        selectedUsersRef.current = selectedUsers;
    }, [selectedUsers]);

    // Stable handleSignIn without dependencies
    const handleSignIn = useCallback(async (url) => {
        if (!url) return;

        setLoading(true);
        setMessage(null);
        setStatus('');
        setResults([]);

        try {
            const response = await fetch('/api/qrcode', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    qrcode_url: url,
                    usernames: selectedUsersRef.current || []
                }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                const res = data.results || [];
                setResults(res);
                if (res.length === 0) {
                    setMessage('NO USERS SELECTED OR PROCESSED');
                    setStatus('error');
                }
            } else {
                setStatus('error');
                const errorMsg = data.detail?.error ||
                    (typeof data.detail === 'string' ? data.detail : null) ||
                    data.message ||
                    'ACCESS DENIED';
                setMessage(errorMsg);
            }
        } catch (error) {
            setStatus('error');
            setMessage('SYSTEM ERROR: CONNECTION FAILED');
        } finally {
            setLoading(false);
            // Resume scanning if using live scanner
            if (scannerRef.current) {
                try {
                    scannerRef.current.resume();
                } catch (e) {
                    // console.log("Scanner resume failed or not paused", e);
                }
            }
        }
    }, []);

    const applyZoom = async (newZoom) => {
        if (!scannerRef.current) return;
        try {
            // Clamp zoom
            let clampedZoom = newZoom;
            if (zoomCapability) {
                clampedZoom = Math.max(zoomCapability.min, Math.min(newZoom, zoomCapability.max));
            } else {
                // Fallback clamp if capabilities missing but we are trying anyway
                clampedZoom = Math.max(1, Math.min(newZoom, 10));
            }

            setZoom(clampedZoom);
            await scannerRef.current.applyVideoConstraints({
                zoom: clampedZoom
            });
        } catch (err) {
            console.error("Failed to apply zoom", err);
        }
    };

    useEffect(() => {
        if (!isActive || !scanStarted) return;

        let isMounted = true;
        let html5QrCode;
        let isScanning = false;

        const startScanner = async () => {
            try {
                // Clear existing element content just in case
                const element = document.getElementById("reader");
                if (element) element.innerHTML = "";

                html5QrCode = new Html5Qrcode("reader");
                scannerRef.current = html5QrCode;

                const config = {
                    fps: 10,
                    aspectRatio: 1.0
                };

                // Camera selection logic
                let cameraConfig = { facingMode: "environment" };
                try {
                    const devices = await Html5Qrcode.getCameras();
                    if (devices && devices.length > 0) {
                        const backCameras = devices.filter(d =>
                            d.label.toLowerCase().includes('back') ||
                            d.label.toLowerCase().includes('rear')
                        );

                        if (backCameras.length > 0) {
                            // Try to find a "main" back camera (not ultra-wide or telephoto specifically)
                            // This usually allows the OS to switch lenses automatically
                            const mainBackCamera = backCameras.find(d =>
                                !d.label.toLowerCase().includes('ultra') &&
                                !d.label.toLowerCase().includes('tele')
                            );

                            // Use the main back camera if found, otherwise just the first back camera
                            const selectedCamera = mainBackCamera || backCameras[0];
                            cameraConfig = { deviceId: { exact: selectedCamera.id } };
                            console.log("Selected camera:", selectedCamera.label);
                        }
                    }
                } catch (e) {
                    console.warn("Error getting cameras, falling back to facingMode", e);
                }

                await html5QrCode.start(
                    cameraConfig,
                    config,
                    (decodedText, decodedResult) => {
                        if (!isMounted) return;
                        console.log(`Code matched = ${decodedText}`, decodedResult);
                        handleSignIn(decodedText);
                        html5QrCode.pause(true);
                    },
                    (errorMessage) => {
                        // ignore failures
                    }
                );

                // Mark as scanning only after successful start
                isScanning = true;

                // Camera is running; reset status text to ready
                if (isMounted) {
                    setMessage(null);
                    setStatus('');
                }

                // Check for zoom capability
                setTimeout(() => {
                    if (!isMounted || !html5QrCode) return;

                    try {
                        const capabilities = html5QrCode.getRunningTrackCameraCapabilities();
                        console.log("Camera Capabilities:", capabilities);

                        if (capabilities && capabilities.zoom) {
                            setZoomCapability(capabilities.zoom);
                            setZoom(capabilities.zoom.min || 1);
                        } else {
                            // Fallback: Try to detect if it's an iPhone and assume some zoom capability?
                            // Or just enable a default range for testing.
                            // For now, let's set a default capability if we are on mobile, 
                            // so the UI shows up and we can try to force it.
                            // Many iOS 17+ devices support it but might not report it in the standard way via this lib.
                            // Let's assume a safe default range [1, 3] for modern phones if not reported.
                            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                            if (isMobile) {
                                console.log("Mobile device detected, forcing zoom capability for testing.");
                                setZoomCapability({ min: 1, max: 10, step: 0.1 });
                            }
                        }
                    } catch (e) {
                        console.log("Could not get camera capabilities", e);
                    }
                }, 500);

            } catch (err) {
                console.error("Error starting scanner", err);
                if (isMounted) {
                    setMessage("CAMERA ERROR: PERMISSION DENIED OR NOT AVAILABLE");
                    setStatus('error');
                    setScanStarted(false);
                }
            }
        };

        // Start immediately on next paint so DOM is ready while the shell animates open
        const initRaf = requestAnimationFrame(() => startScanner());

        return () => {
            isMounted = false;
            cancelAnimationFrame(initRaf);
            if (html5QrCode) {
                if (isScanning) {
                    html5QrCode.stop().then(() => {
                        html5QrCode.clear();
                    }).catch(err => {
                        console.error("Failed to stop scanner", err);
                    });
                } else {
                    try {
                        html5QrCode.clear();
                    } catch (e) {
                        console.warn("Failed to clear scanner", e);
                    }
                }
            }
            scannerRef.current = null;
        };
    }, [isActive, handleSignIn, scanStarted]);

    // Touch handlers for pinch-to-zoom
    useEffect(() => {
        const node = document.getElementById("reader");
        if (!node || !scanStarted) return;

        const handleTouchStart = (e) => {
            if (e.touches.length === 2) {
                const dist = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
                touchStartDist.current = dist;
                startZoom.current = zoom;
            }
        };

        const handleTouchMove = (e) => {
            if (e.touches.length === 2) {
                // Prevent page scrolling when pinching
                if (e.cancelable) {
                    e.preventDefault();
                }

                if (touchStartDist.current) {
                    const dist = Math.hypot(
                        e.touches[0].pageX - e.touches[1].pageX,
                        e.touches[0].pageY - e.touches[1].pageY
                    );

                    // Calculate zoom factor
                    // Sensitivity: 100px pinch = 1x zoom change (adjustable)
                    const delta = (dist - touchStartDist.current) / 100;
                    const newZoom = startZoom.current + delta;

                    applyZoom(newZoom);
                }
            }
        };

        const handleTouchEnd = () => {
            touchStartDist.current = null;
        };

        // Add non-passive listener to allow preventDefault
        node.addEventListener('touchstart', handleTouchStart, { passive: false });
        node.addEventListener('touchmove', handleTouchMove, { passive: false });
        node.addEventListener('touchend', handleTouchEnd);

        return () => {
            node.removeEventListener('touchstart', handleTouchStart);
            node.removeEventListener('touchmove', handleTouchMove);
            node.removeEventListener('touchend', handleTouchEnd);
        };
    }, [zoom, scanStarted]); // Re-bind when scanner mounts or zoom updates.

    // Global pinch-to-zoom prevention
    useEffect(() => {
        const handleGlobalTouchMove = (e) => {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        };

        document.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });

        return () => {
            document.removeEventListener('touchmove', handleGlobalTouchMove);
        };
    }, []);

    const handleNativeCamera = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const preprocessImage = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    // Max dimension to avoid huge memory usage
                    const MAX_DIM = 1500;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_DIM) {
                            height *= MAX_DIM / width;
                            width = MAX_DIM;
                        }
                    } else {
                        if (height > MAX_DIM) {
                            width *= MAX_DIM / height;
                            height = MAX_DIM;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(new File([blob], "resized_qr.jpg", { type: "image/jpeg" }));
                        } else {
                            reject(new Error("Canvas to Blob failed"));
                        }
                    }, 'image/jpeg', 0.8);
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const handleFileChange = async (e) => {
        if (e.target.files.length === 0) return;

        const originalFile = e.target.files[0];

        // Use a unique ID for the temporary scanner to avoid conflicts
        const tempId = "file-reader-" + Date.now();
        const tempDiv = document.createElement("div");
        tempDiv.id = tempId;
        tempDiv.style.display = "none";
        document.body.appendChild(tempDiv);

        const html5QrCode = new Html5Qrcode(tempId);

        try {
            setLoading(true);
            setMessage("PROCESSING IMAGE...");

            // Preprocess image to resize if too large (fixes iOS memory/scan issues)
            let fileToScan = originalFile;
            try {
                fileToScan = await preprocessImage(originalFile);
                console.log("Image resized for scanning");
            } catch (resizeErr) {
                console.warn("Image resize failed, using original", resizeErr);
            }

            // scanFile(file, showImage) - showImage=false to avoid rendering large images to DOM
            const decodedText = await html5QrCode.scanFile(fileToScan, false);
            console.log(`File matched = ${decodedText}`);
            handleSignIn(decodedText);
        } catch (err) {
            console.error("Error scanning file", err);
            setStatus('error');
            setMessage('SCAN FAILED: QR CODE NOT DETECTED\nTRY MOVING CLOSER OR ADJUSTING LIGHT');
            setLoading(false);
        } finally {
            try {
                html5QrCode.clear();
            } catch (ignore) { }

            // Cleanup DOM
            if (document.body.contains(tempDiv)) {
                document.body.removeChild(tempDiv);
            }

            // Reset input
            e.target.value = '';
        }
    };

    // const handleZoomChange = (e) => {
    //     const newZoom = Number(e.target.value);
    //     applyZoom(newZoom);
    // };

    useEffect(() => {
        if (!isActive) {
            setScanStarted(false);
            setMessage(null);
            setStatus('');
        }
    }, [isActive]);

    const startCamera = () => {
        setScanStarted(true);
        setStatus('');
        setMessage('ACTIVATING CAMERA...');
    };

    const defaultMessage = scanStarted ? 'SYSTEM READY' : 'CLICK START TO ACTIVATE CAMERA';

    return (
        <div className="card">
            <h2>QR SCANNER</h2>

            <div className={`scanner-shell ${scanStarted ? 'active' : ''}`}>
                {scanStarted ? (
                    <div
                        id="reader"
                        className="scanner-surface"
                        style={{ touchAction: 'pan-y', overflow: 'hidden' }}
                    ></div>
                ) : (
                    <button
                        className="scanner-launch"
                        onClick={startCamera}
                        disabled={loading}
                    >
                        START CAMERA
                    </button>
                )}
            </div>
            <div id="file-reader" style={{ display: 'none' }}></div>

            {/* Zoom slider hidden as requested */}
            {/* {zoomCapability && (
                <div style={{ width: '100%', padding: '5px 20px 0', boxSizing: 'border-box', display: 'flex', justifyContent: 'center' }}>
                    <input
                        id="zoom-slider"
                        type="range"
                        min={zoomCapability.min}
                        max={zoomCapability.max}
                        step={zoomCapability.step || 0.1}
                        value={zoom}
                        onChange={handleZoomChange}
                        style={{ width: '80%', height: '4px' }}
                    />
                </div>
            )} */}

            <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: 'none' }}
            />

            <button
                onClick={scanStarted ? () => setScanStarted(false) : handleNativeCamera}
                disabled={loading}
                style={{ marginTop: '0.5rem', marginBottom: '0.5rem', width: '100%' }}
            >
                {scanStarted ? 'CLOSE CAMERA' : 'USE NATIVE CAMERA'}
            </button>

            {/* Per-user result cards */}
            {results.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '1rem' }}>
                    {results.map((r, i) => {
                        const isOk = r.status === 'success';
                        return (
                            <div
                                key={i}
                                style={{
                                    padding: '10px 14px',
                                    borderRadius: '6px',
                                    border: `1px solid ${isOk ? 'rgba(76, 175, 80, 0.5)' : 'rgba(244, 67, 54, 0.5)'}`,
                                    background: isOk ? 'rgba(76, 175, 80, 0.08)' : 'rgba(244, 67, 54, 0.08)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    textAlign: 'left'
                                }}
                            >
                                <span style={{ fontSize: '1.1rem' }}>{isOk ? '✅' : '❌'}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: isOk ? '#66bb6a' : '#ef5350', fontWeight: 600 }}>
                                        {r.username}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px', wordBreak: 'break-word' }}>
                                        {r.message || (isOk ? 'Success' : 'Failed')}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Fallback message */}
            {results.length === 0 && (
                <div
                    className={`message ${status}`}
                    style={{
                        marginTop: '0.5rem',
                        minHeight: '3em',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        whiteSpace: 'pre-line',
                        fontSize: '0.9rem'
                    }}
                >
                    {message || (loading ? 'PROCESSING...' : defaultMessage)}
                </div>
            )}
        </div>
    );
};

export default QRCodeSignIn;
