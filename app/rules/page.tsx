"use client";

import { useState } from "react";
import Link from "next/link";

type Lang = "bn" | "en";

const RULES = {
    bn: {
        title: "গাফলা - খেলার নিয়ম",
        sections: [
            {
                heading: "খেলার পরিচিতি",
                items: [
                    "গাফলা হলো বাংলাদেশের জনপ্রিয় ডমিনো খেলা।",
                    "এই খেলায় ২৮টি তাস (ডমিনো টাইল) ব্যবহার করা হয়।",
                    "প্রতিটি তাসে দুটি অংশ থাকে, প্রতিটি অংশে ০ থেকে ৬ পর্যন্ত ডট থাকে।",
                    "২ থেকে ৪ জন খেলোয়াড় একসাথে খেলতে পারে।",
                ],
            },
            {
                heading: "খেলা শুরু",
                items: [
                    "প্রতিটি খেলোয়াড় ৭টি করে তাস পায়।",
                    "বাকি তাসগুলো বোনইয়ার্ডে (স্টকপাইল) থাকে।",
                    "যার কাছে 0:0 (ডাবল ব্ল্যাংক) তাস আছে সে প্রথমে খেলবে।",
                    "0:0 দিয়েই খেলা শুরু করতে হবে — এটা বাধ্যতামূলক।",
                ],
            },
            {
                heading: "কিভাবে খেলবেন",
                items: [
                    "ঘড়ির কাঁটার দিকে পালা ঘোরে।",
                    "আপনার পালায় বোর্ডের যেকোনো এক প্রান্তে একটি তাস রাখতে হবে।",
                    "তাসের একটি অংশ বোর্ডের প্রান্তের সংখ্যার সাথে মিলতে হবে।",
                    "যদি কোনো তাস না মেলে, বোনইয়ার্ড থেকে একটি তাস তুলতে হবে।",
                    "বোনইয়ার্ড খালি হলে এবং কোনো তাস না মিললে, পাস করতে হবে।",
                ],
            },
            {
                heading: "জয়ের শর্ত",
                items: [
                    "যে খেলোয়াড় সবার আগে সব তাস শেষ করতে পারে, সে জেতে।",
                    "জিতলে ঐ খেলোয়াড় ০ পয়েন্ট পায়।",
                    "হারলে হাতে থাকা তাসের মোট ডটের যোগফল পয়েন্ট হিসেবে গণনা হয়।",
                    "কম পয়েন্ট = ভালো।",
                ],
            },
            {
                heading: "ব্লক / শর্ট",
                items: [
                    "যদি কোনো খেলোয়াড়ই তাস রাখতে না পারে এবং বোনইয়ার্ড খালি থাকে — গেম 'ব্লক' বা 'শর্ট' হয়।",
                    "এক্ষেত্রে সবচেয়ে কম পয়েন্টের খেলোয়াড় জেতে।",
                    "রুমের নিয়ম অনুযায়ী — ব্লকার (যে ব্লক করেছে) শূন্য পয়েন্ট পাবে কি না তা নির্ধারণ করা যায়।",
                ],
            },
            {
                heading: "রাউন্ড ও স্কোর",
                items: [
                    "একাধিক রাউন্ড খেলা যায়।",
                    "প্রতিটি রাউন্ডে পয়েন্ট যোগ হতে থাকে।",
                    "সামগ্রিকভাবে সবচেয়ে কম পয়েন্টের খেলোয়াড় সেরা।",
                ],
            },
        ],
    },
    en: {
        title: "GAFLA - Game Rules",
        sections: [
            {
                heading: "Introduction",
                items: [
                    "Gafla is a popular Bangladeshi domino game.",
                    "Uses a standard 28-tile double-six domino set.",
                    "Each tile has two halves with 0 to 6 dots each.",
                    "2 to 4 players can play together.",
                ],
            },
            {
                heading: "Starting the Game",
                items: [
                    "Each player is dealt 7 tiles.",
                    "Remaining tiles go to the boneyard (stock).",
                    "The player holding the 0:0 (double blank) tile plays first.",
                    "The first move MUST be the 0:0 tile — this is mandatory.",
                ],
            },
            {
                heading: "How to Play",
                items: [
                    "Turns proceed clockwise around the table.",
                    "On your turn, place a tile matching one end of the board.",
                    "One half of your tile must match the number at the board's endpoint.",
                    "If you cannot play, draw a tile from the boneyard.",
                    "If the boneyard is empty and you can't play, you must pass.",
                ],
            },
            {
                heading: "Winning",
                items: [
                    "The first player to empty their hand wins the round.",
                    "The winner scores 0 points for that round.",
                    "Losers score the sum of dots remaining in their hand.",
                    "Lower total points = better overall standing.",
                ],
            },
            {
                heading: "Blocked Game (Short)",
                items: [
                    "If no player can make a move and the boneyard is empty — the game is 'blocked' (short).",
                    "The player with the fewest points in hand wins.",
                    "Room rules can configure whether the blocker gets zero points or not.",
                ],
            },
            {
                heading: "Rounds & Scoring",
                items: [
                    "Multiple rounds can be played.",
                    "Points accumulate across rounds.",
                    "The player with the lowest total score is the overall winner.",
                ],
            },
        ],
    },
};

export default function RulesPage() {
    const [lang, setLang] = useState<Lang>("bn");
    const content = RULES[lang];

    return (
        <div className="content-page">
            <div className="content-header">
                <Link href="/lobby" className="back-link">← ফিরে যান / Back</Link>
                <div className="lang-toggle">
                    <button
                        className={`lang-btn ${lang === "bn" ? "active" : ""}`}
                        onClick={() => setLang("bn")}
                    >
                        বাংলা
                    </button>
                    <button
                        className={`lang-btn ${lang === "en" ? "active" : ""}`}
                        onClick={() => setLang("en")}
                    >
                        English
                    </button>
                </div>
            </div>

            <div className="content-body">
                <h1 className="content-title">{content.title}</h1>

                {content.sections.map((section, i) => (
                    <div key={i} className="rule-section">
                        <h2 className="rule-heading">
                            <span className="rule-num">{i + 1}</span>
                            {section.heading}
                        </h2>
                        <ul className="rule-list">
                            {section.items.map((item, j) => (
                                <li key={j}>{item}</li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
}
