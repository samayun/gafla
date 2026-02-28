"use client";

import Link from "next/link";

const steps = [
    {
        num: "১",
        title: "অ্যাকাউন্ট তৈরি করুন",
        titleEn: "Create Account",
        desc: "প্রথমে সাইন আপ পেজে গিয়ে আপনার নাম, ইউজারনেম এবং পাসওয়ার্ড দিয়ে অ্যাকাউন্ট তৈরি করুন। ইউজারনেম ইউনিক হতে হবে — শুধু ইংরেজি অক্ষর, সংখ্যা এবং আন্ডারস্কোর ব্যবহার করতে পারবেন।",
        descEn: "Go to the Sign Up page and create an account with your name, a unique username, and password.",
    },
    {
        num: "২",
        title: "সাইন ইন করুন",
        titleEn: "Sign In",
        desc: "অ্যাকাউন্ট তৈরির পর আপনি স্বয়ংক্রিয়ভাবে লগ ইন হয়ে যাবেন। পরবর্তীতে সাইন ইন পেজ থেকে ইউজারনেম ও পাসওয়ার্ড দিয়ে লগ ইন করতে পারবেন। পাসওয়ার্ড ভুলে গেলে 'পাসওয়ার্ড ভুলে গেছেন' অপশন ব্যবহার করুন।",
        descEn: "You'll be auto-logged in after signup. Use Sign In page later. Use Forget Password if you forget it.",
    },
    {
        num: "৩",
        title: "রুম তৈরি করুন বা যোগ দিন",
        titleEn: "Create or Join Room",
        desc: "লবি পেজ থেকে 'রুম তৈরি করুন' বাটনে ক্লিক করুন — একটি ৬ অক্ষরের রুম কোড তৈরি হবে। এই কোড বা লিংক বন্ধুদের শেয়ার করুন WhatsApp, Facebook, Messenger দিয়ে। অথবা বন্ধুদের কাছ থেকে কোড নিয়ে 'রুমে যোগ দিন' বক্সে লিখে জয়েন করুন।",
        descEn: "Create a room to get a 6-character code. Share via WhatsApp/Facebook/Messenger. Or enter a friend's code to join.",
    },
    {
        num: "৪",
        title: "সিট বাছাই করুন",
        titleEn: "Select Your Seat",
        desc: "রুমে ঢোকার পর ৪টি সিটের মধ্যে একটি বাছাই করুন। যেকোনো খালি সিটে বসতে পারবেন। সিট নির্বাচন করে 'টেবিলে বসুন' বাটনে ক্লিক করুন।",
        descEn: "Choose one of 4 available seats in the room, then click 'Join Table'.",
    },
    {
        num: "৫",
        title: "খেলা শুরু করুন",
        titleEn: "Start the Game",
        desc: "কমপক্ষে ২ জন খেলোয়াড় রুমে ঢুকলে যেকেউ 'খেলা শুরু' বাটন চাপতে পারবেন। প্রতি খেলোয়াড় ৭টি করে তাস পাবে। গেমের প্রথম রাউন্ডে যার কাছে 0:0 আছে সে প্রথম খেলবে। পরের রাউন্ডে জয়ী ভেন্ডা দিয়ে প্রথম চাল দেয়।",
        descEn: "Once 2+ players join, anyone can start. 7 tiles each. Round 1: player with 0:0 goes first. Round 2+: winner starts with venda.",
    },
    {
        num: "৬",
        title: "তাস খেলুন",
        titleEn: "Play Tiles",
        desc: "আপনার পালায় নীল আলোয় জ্বলে ওঠা তাসগুলো খেলতে পারবেন — সেগুলোতে ট্যাপ/ক্লিক করুন। তাস বোর্ডের দুই প্রান্তের যেকোনো একটার সাথে মিলতে হবে। যদি দুই দিকেই মেলে, আপনাকে কোন দিকে খেলতে চান জিজ্ঞেস করা হবে। তাস না মিললে 'তাস তুলুন' বাটন চাপুন। বোনইয়ার্ড খালি হলে 'পাস' বাটন চাপুন।",
        descEn: "Tap highlighted (playable) tiles. Match board endpoints. Draw if no match. Pass if boneyard empty.",
    },
    {
        num: "৭",
        title: "জিতুন!",
        titleEn: "Win!",
        desc: "সবার আগে সব তাস শেষ করুন — আপনি জিতবেন! গেম ব্লক হলে সবচেয়ে কম পয়েন্টের খেলোয়াড় জেতে। একাধিক রাউন্ড খেলে মোট স্কোর দেখুন।",
        descEn: "Empty your hand first to win! Lowest points wins in a block. Play multiple rounds.",
    },
    {
        num: "৮",
        title: "মাল্টি-ট্যাব সাপোর্ট",
        titleEn: "Multi-tab Support",
        desc: "আপনি একই ব্রাউজারে একাধিক ট্যাবে লগ ইন থাকতে পারবেন। সব ট্যাবে একই গেম স্টেট দেখাবে। আপনার ইউজারনেম দিয়ে পরিচয় হয়, সকেট আইডি না।",
        descEn: "Open multiple tabs — all show the same game state. Identity is by username, not connection.",
    },
    {
        num: "৯",
        title: "কাস্টমাইজেশন",
        titleEn: "Customization",
        desc: "কাস্টমাইজ পেজ থেকে তাসের রঙ, আকার এবং থিম পরিবর্তন করতে পারবেন। আপনার পছন্দ অনুযায়ী খেলার অভিজ্ঞতা সাজান।",
        descEn: "Customize tile colors, size, and theme from the Customization page.",
    },
];

export default function GuidePage() {
    return (
        <div className="content-page">
            <div className="content-header">
                <Link href="/lobby" className="back-link">← ফিরে যান / Back</Link>
            </div>

            <div className="content-body">
                <h1 className="content-title">
                    কিভাবে গাফলা খেলবেন
                    <span className="en-sub">How to Play Gafla</span>
                </h1>

                <div className="guide-steps">
                    {steps.map((step) => (
                        <div key={step.num} className="guide-step">
                            <div className="step-num">{step.num}</div>
                            <div className="step-content">
                                <h3>{step.title}</h3>
                                <p className="step-title-en">{step.titleEn}</p>
                                <p className="step-desc">{step.desc}</p>
                                <p className="step-desc-en">{step.descEn}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
