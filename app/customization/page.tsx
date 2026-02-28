"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Prefs {
    theme: "dark" | "light" | "ocean" | "forest" | "royal";
    cardSize: "small" | "medium" | "large";
    dotStyle: "classic" | "neon" | "minimal";
}

const THEMES = {
    dark: { label: "ডার্ক / Dark", bg: "#020617", accent: "#38bdf8", secondary: "#ec4899", text: "#f8fafc", textSec: "#94a3b8", glass: "rgba(15,23,42,0.85)", glassBorder: "rgba(255,255,255,0.1)", isLight: false },
    light: { label: "লাইট / Light", bg: "#f0f4f8", accent: "#2563eb", secondary: "#db2777", text: "#1e293b", textSec: "#64748b", glass: "rgba(255,255,255,0.85)", glassBorder: "rgba(0,0,0,0.1)", isLight: true },
    ocean: { label: "সমুদ্র / Ocean", bg: "#0c1929", accent: "#06b6d4", secondary: "#8b5cf6", text: "#f8fafc", textSec: "#94a3b8", glass: "rgba(15,23,42,0.85)", glassBorder: "rgba(255,255,255,0.1)", isLight: false },
    forest: { label: "বন / Forest", bg: "#0a1f0a", accent: "#22c55e", secondary: "#eab308", text: "#f8fafc", textSec: "#94a3b8", glass: "rgba(15,23,42,0.85)", glassBorder: "rgba(255,255,255,0.1)", isLight: false },
    royal: { label: "রাজকীয় / Royal", bg: "#1a0a2e", accent: "#a855f7", secondary: "#f43f5e", text: "#f8fafc", textSec: "#94a3b8", glass: "rgba(15,23,42,0.85)", glassBorder: "rgba(255,255,255,0.1)", isLight: false },
};

const CARD_SIZES = {
    small: { label: "ছোট / Small", width: "42px", height: "82px" },
    medium: { label: "মাঝারি / Medium", width: "56px", height: "110px" },
    large: { label: "বড় / Large", width: "68px", height: "134px" },
};

const DOT_STYLES = {
    classic: { label: "ক্লাসিক / Classic" },
    neon: { label: "নিওন / Neon" },
    minimal: { label: "মিনিমাল / Minimal" },
};

function getDefaultPrefs(): Prefs {
    if (typeof window === "undefined") return { theme: "dark", cardSize: "medium", dotStyle: "classic" };
    try {
        const stored = localStorage.getItem("gafla_prefs");
        if (stored) return JSON.parse(stored);
    } catch { /* empty */ }
    return { theme: "dark", cardSize: "medium", dotStyle: "classic" };
}

export default function CustomizationPage() {
    const [prefs, setPrefs] = useState<Prefs>(getDefaultPrefs);

    useEffect(() => {
        localStorage.setItem("gafla_prefs", JSON.stringify(prefs));
        applyTheme(prefs);
    }, [prefs]);

    return (
        <div className="content-page">
            <div className="content-header">
                <Link href="/lobby" className="back-link">← ফিরে যান / Back</Link>
            </div>

            <div className="content-body">
                <h1 className="content-title">
                    কাস্টমাইজেশন
                    <span className="en-sub">Customization</span>
                </h1>

                {/* Theme Selection */}
                <div className="custom-section">
                    <h2>থিম / Theme</h2>
                    <div className="option-grid">
                        {(Object.keys(THEMES) as Array<keyof typeof THEMES>).map((key) => (
                            <button
                                key={key}
                                className={`option-card ${prefs.theme === key ? "selected" : ""}`}
                                onClick={() => setPrefs((p) => ({ ...p, theme: key }))}
                            >
                                <div
                                    className="theme-preview"
                                    style={{
                                        background: THEMES[key].bg,
                                        borderColor: prefs.theme === key ? THEMES[key].accent : "transparent",
                                    }}
                                >
                                    <div className="preview-dot" style={{ background: THEMES[key].accent }} />
                                    <div className="preview-dot" style={{ background: THEMES[key].secondary }} />
                                </div>
                                <span>{THEMES[key].label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Card Size */}
                <div className="custom-section">
                    <h2>তাসের আকার / Card Size</h2>
                    <div className="option-grid">
                        {(Object.keys(CARD_SIZES) as Array<keyof typeof CARD_SIZES>).map((key) => (
                            <button
                                key={key}
                                className={`option-card ${prefs.cardSize === key ? "selected" : ""}`}
                                onClick={() => setPrefs((p) => ({ ...p, cardSize: key }))}
                            >
                                <div
                                    className="size-preview"
                                    style={{
                                        width: CARD_SIZES[key].width,
                                        height: CARD_SIZES[key].height,
                                    }}
                                />
                                <span>{CARD_SIZES[key].label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Dot Style */}
                <div className="custom-section">
                    <h2>ডটের স্টাইল / Dot Style</h2>
                    <div className="option-grid">
                        {(Object.keys(DOT_STYLES) as Array<keyof typeof DOT_STYLES>).map((key) => (
                            <button
                                key={key}
                                className={`option-card ${prefs.dotStyle === key ? "selected" : ""}`}
                                onClick={() => setPrefs((p) => ({ ...p, dotStyle: key }))}
                            >
                                <div className={`dot-preview ${key}`}>
                                    <div className="preview-dots">
                                        {[1, 2, 3].map((d) => (
                                            <div key={d} className="pdot" />
                                        ))}
                                    </div>
                                </div>
                                <span>{DOT_STYLES[key].label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="custom-note">
                    <p>পরিবর্তনগুলো স্বয়ংক্রিয়ভাবে সংরক্ষিত হচ্ছে।</p>
                    <p className="en-text">Changes are saved automatically.</p>
                </div>
            </div>
        </div>
    );
}

function applyTheme(prefs: Prefs) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const theme = THEMES[prefs.theme];

    root.style.setProperty("--bg-color", theme.bg);
    root.style.setProperty("--accent-primary", theme.accent);
    root.style.setProperty("--accent-secondary", theme.secondary);
    root.style.setProperty("--text-primary", theme.text);
    root.style.setProperty("--text-secondary", theme.textSec);
    root.style.setProperty("--glass", theme.glass);
    root.style.setProperty("--glass-border", theme.glassBorder);

    root.setAttribute("data-card-size", prefs.cardSize);
    root.setAttribute("data-dot-style", prefs.dotStyle);
    root.setAttribute("data-theme", theme.isLight ? "light" : "dark");
}
