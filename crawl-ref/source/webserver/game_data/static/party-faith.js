define(["jquery", "./party-status-model", "./status-icons", "./tileinfo-dngn"],
function ($, model, icons, tiles) {
    "use strict";

    // Decorative identity is presentation only. Native rank controls the craft
    // layers; Xom and Gozag deliberately have no inferred favor progression.
    // Coordinates share a 60x68 envelope around the native 42x50 portrait.
    var shrines = {
        ZIN: { color: "#dfd5ad", arch: "M8 55V22L15 10H45L52 22V55", base: "M5 55H55V60H52V67H8V60H5Z",
            seal: "M0-4V4M-5-2H5M-4-2L-6 2H-2ZM4-2L2 2H6Z", sides: "M5 52V23L10 17M55 52V23L50 17", crown: "M11 13L15 6H22M38 6H45L49 13" },
        SHINING_ONE: { color: "#ebd28c", arch: "M8 55V26a22 22 0 0 1 44 0V55", base: "M7 55H53L56 61L52 67H8L4 61Z",
            seal: "M0-3V3M-3 0H3M-4-4L-2-2M4-4L2-2M-4 4L-2 2M4 4L2 2", sides: "M4 48L1 45M4 36H0M5 24L1 21M56 48L59 45M56 36H60M55 24L59 21", crown: "M10 15L6 11M17 9L15 4M43 9L45 4M50 15L54 11" },
        KIKUBAAQUDGHA: { color: "#b7abc9", arch: "M8 55V26Q8 14 17 9L21 7H39L43 9Q52 14 52 26V55", base: "M6 55H54L52 59L55 64L50 67H10L5 64L8 59Z",
            seal: "M-4-2Q-4-5 0-5T4-2V1L2 2V4H-2V2L-4 1ZM-2-1H-1M1-1H2", sides: "M5 51L1 48L5 45L1 42L5 39V25M55 51L59 48L55 45L59 42L55 39V25", crown: "M11 16L7 12L12 9L13 4L20 6M49 16L53 12L48 9L47 4L40 6" },
        YREDELEMNUL: { color: "#a9b3a3", arch: "M8 55V24L16 12L22 8H38L44 12L52 24V55", base: "M8 55H52L55 67H5Z",
            seal: "M-4 4V-2L0-5L4-2V4ZM0-2V3M-2 0H2", sides: "M4 54V28L0 22L7 25M56 54V28L60 22L53 25", crown: "M12 15V5L20 9M48 15V5L40 9" },
        XOM: { color: "#d3a1d3", arch: "M8 55L10 37L6 30L12 18L10 14L23 7L37 9L49 13L47 19L54 29L50 40L52 55", base: "M5 55L26 56L32 53L55 55L51 61L57 65L34 67L27 64L9 67L4 62Z",
            seal: "M-4-4L4 3L-4 4L3-4ZM-3 0H3", sides: "M3 51L6 44L1 39L5 34M56 48L59 42L54 35L59 30", crown: "M10 16L5 8L16 11L20 4M48 17L56 12L48 8L43 3" },
        VEHUMET: { color: "#cf9db9", arch: "M8 55V24L18 10L23 7H37L42 10L52 24V55", base: "M4 66L9 55H51L56 66L43 64L30 67L17 64Z",
            seal: "M0-5L5 4H-5ZM0-2L2 2H-2Z", sides: "M4 53L1 39L5 28L2 22M56 53L59 39L55 28L58 22", crown: "M10 17L12 5L22 9M50 17L48 5L38 9" },
        OKAWARU: { color: "#b5b6ba", arch: "M8 55V25L12 16L21 8H39L48 16L52 25V55", base: "M6 55H54V63L48 67H12L6 63Z",
            seal: "M-4 4L3-4M-3-4L4 4M1-4H4V-1M-4-4H-1M-3-5V-2", sides: "M4 54V19L2 15L4 9L6 15L4 19M56 54V19L54 15L56 9L58 15L56 19", crown: "M12 17L16 6H22M48 17L44 6H38" },
        MAKHLEB: { color: "#dc8e80", arch: "M8 55V25L13 18L12 10L22 8H38L48 10L47 18L52 25V55", base: "M7 55H53L56 60L50 64L48 67H12L10 64L4 60Z",
            seal: "M0 5Q-6 1-3-4L0-1L3-5Q6 1 0 5Z", sides: "M5 52L2 44L5 36L1 28L6 24M55 52L58 44L55 36L59 28L54 24", crown: "M13 17Q3 13 7 3L17 10L21 6M47 17Q57 13 53 3L43 10L39 6" },
        SIF_MUNA: { color: "#93bfd7", arch: "M8 55V23Q9 12 19 9L24 7H36L41 9Q51 12 52 23V55", base: "M5 55Q17 53 30 57Q43 53 55 55V65Q43 63 30 67Q17 63 5 65Z",
            seal: "M0-3Q-3-5-5-3V4Q-2 2 0 4Q2 2 5 4V-3Q3-5 0-3V4", sides: "M4 51V23Q0 20 4 17L8 20M56 51V23Q60 20 56 17L52 20", crown: "M12 15Q13 6 22 6M48 15Q47 6 38 6" },
        TROG: { color: "#d5a07b", arch: "M8 55V27L13 17L12 11L22 8H38L48 11L47 17L52 27V55", base: "M5 55H55L52 59L56 64L48 67H12L4 64L8 59Z",
            seal: "M-4 4L3-4M-4-2Q0-5 4-4L3 0M-3 4L-1 2", sides: "M5 52L1 45L5 37L2 30L7 26M55 52L59 45L55 37L58 30L53 26", crown: "M14 17Q5 14 7 6L16 11L20 5M46 17Q55 14 53 6L44 11L40 5" },
        NEMELEX_XOBEH: { color: "#c8a1da", arch: "M8 55V24L13 15L20 10L24 7H36L40 10L47 15L52 24V55", base: "M5 55L29 56L30 54L31 56L55 55L53 67L30 65L7 67Z",
            seal: "M0-5L4 0L0 5L-4 0ZM0-2L1 0L0 2L-1 0Z", sides: "M4 52L0 47L4 42L8 47ZM56 52L52 47L56 42L60 47Z", crown: "M11 17L8 9L17 11L21 4M49 17L52 9L43 11L39 4" },
        ELYVILON: { color: "#d6dccc", arch: "M8 55V27Q7 14 20 9L25 7H35L40 9Q53 14 52 27V55", base: "M5 55Q15 52 24 56H36Q45 52 55 55L52 65Q41 63 30 67Q19 63 8 65Z",
            seal: "M0 4Q-5 2-5-3L0 0L5-3Q5 2 0 4ZM0 0V4", sides: "M6 51Q0 45 3 36L7 42M54 51Q60 45 57 36L53 42", crown: "M12 16Q3 10 7 4Q12 8 21 7M48 16Q57 10 53 4Q48 8 39 7" },
        LUGONU: { color: "#bc9bd4", arch: "M8 55L9 36L6 29L11 20L14 10L23 8L28 5L39 9L45 13L53 27L50 35L52 55", base: "M5 55H26L30 58L33 54L55 55L51 61L55 67H35L30 63L26 67H5L9 61Z",
            seal: "M-4-4L-1-1L-3 2L1 1L0 5M3-5L1-2L4 0L2 4", sides: "M4 52L1 46L5 40L2 34L6 27M56 53L59 46L55 38L58 32L54 24", crown: "M12 17L7 9L18 12L22 3M49 18L55 9L43 11L39 4" },
        BEOGH: { color: "#c3ae7f", arch: "M8 55V27L11 20L15 18L14 10L22 8H38L46 10L45 18L49 20L52 27V55", base: "M5 55H55V64L48 67L41 64L30 67L19 64L12 67L5 64Z",
            seal: "M0-4V4M-4-2L0-5L4-2M-3 1L0 4L3 1", sides: "M4 53V30L1 24L5 17L8 25M56 53V30L59 24L55 17L52 25", crown: "M13 17L8 9L17 11L20 4M47 17L52 9L43 11L40 4" },
        JIYVA: { color: "#b6cb85", arch: "M8 55Q6 45 9 38L7 29Q7 13 21 9Q30 5 39 9Q53 13 53 29L51 39Q54 49 52 55", base: "M5 55Q12 51 19 56Q27 52 32 56Q43 51 55 55L53 64Q49 69 44 65Q38 69 33 65Q25 69 20 65Q12 69 7 65Z",
            seal: "M-5 3Q-4-4 0-4T5 3Q3 5 0 3Q-3 5-5 3ZM-2-1H-1M1-1H2", sides: "M5 51Q0 47 3 40T5 29M55 51Q60 47 57 40T55 29", crown: "M11 17Q4 9 12 7Q17 10 21 5M49 17Q56 9 48 7Q43 10 39 5" },
        FEDHAS: { color: "#a5c58c", arch: "M8 55V27Q9 13 21 9L26 7H34L39 9Q51 13 52 27V55", base: "M5 55L14 53L20 56L30 54L40 56L46 53L55 55L51 63L55 67L42 65L30 67L18 65L5 67L9 63Z",
            seal: "M0 5V-3M0 0Q-5 0-4-4Q0-5 0 0Q5-1 4-5M0 3L-3 1M0 2L3 0", sides: "M5 54Q1 41 5 27M4 45L0 41M4 37L8 33M55 54Q59 41 55 27M56 45L60 41M56 37L52 33", crown: "M12 17Q4 12 8 6L16 10L21 3M48 17Q56 12 52 6L44 10L39 3" },
        CHEIBRIADOS: { color: "#b4bfab", arch: "M8 55V28Q8 16 20 11L24 8H36L40 11Q52 16 52 28V55", base: "M9 55H51V59H54V63H57V67H3V63H6V59H9Z",
            seal: "M-5 3H4Q6 3 5 0L3 1M-1 3A4 4 0 1 1 3-1Q3 2 0 1Q-2 0 0-1", sides: "M4 51V42H1V35H4V28M56 51V42H59V35H56V28", crown: "M11 18V11H16V6H22M49 18V11H44V6H38" },
        ASHENZARI: { color: "#b4c2c4", arch: "M8 55V25L13 15L22 9L26 7H34L38 9L47 15L52 25V55", base: "M5 55H55L53 58V64L49 67H11L7 64V58Z",
            seal: "M-5 0L-2-3L1 0L-2 3ZM-1 0L2-3L5 0L2 3Z", sides: "M4 51L1 47L4 43L7 47ZM4 41L1 37L4 33L7 37ZM56 51L53 47L56 43L59 47ZM56 41L53 37L56 33L59 37Z", crown: "M12 17L8 13L12 9L16 13ZM44 13L48 9L52 13L48 17M17 8L21 4M43 8L39 4" },
        DITHMENOS: { color: "#9aaec7", arch: "M8 55V27Q9 12 23 9L27 7H35Q49 9 52 25V55", base: "M5 55Q17 58 30 54Q43 58 55 55L52 66Q43 64 30 67Q17 64 8 66Z",
            seal: "M3-5A5 5 0 1 0 3 5Q-3 1 3-5Z", sides: "M5 53Q0 44 5 35Q1 31 4 25M55 53Q60 44 55 35Q59 31 56 25", crown: "M12 17Q4 11 11 4Q13 10 21 7M48 17Q56 11 49 4Q47 10 39 7" },
        GOZAG: { color: "#e4c979", arch: "M8 55V24L11 17L18 10L24 8H36L42 10L49 17L52 24V55", base: "M5 55H55V60H52V67H8V60H5ZM10 58H50",
            seal: "M-4 0A4 4 0 1 0 4 0A4 4 0 1 0-4 0M0-2V2M-1-1H1M-1 1H1", sides: "M4 52V27M1 49H7M1 44H7M1 39H7M56 52V27M53 49H59M53 44H59M53 39H59", crown: "M11 17L9 8L17 11L21 4M49 17L51 8L43 11L39 4" },
        QAZLAL: { color: "#a4c9cc", arch: "M8 55V29Q4 23 11 18Q9 11 19 10L24 7H36L41 10Q51 11 49 18Q56 23 52 29V55", base: "M5 55L18 57L23 54L30 57L37 54L42 57L55 55L51 61L55 67H5L9 61Z",
            seal: "M-5-1Q-6-4-2-4Q1-7 3-3Q7-3 5 0H1L-2 5L-1 1H-5", sides: "M5 53L1 45L6 42L2 34L7 29M55 53L59 45L54 42L58 34L53 29", crown: "M11 17Q4 13 8 8L17 10L20 3M49 17Q56 13 52 8L43 10L40 3" },
        RU: { color: "#ceb99a", arch: "M8 55V26Q7 15 18 10L24 7H36L42 10Q53 15 52 26V55", base: "M5 55H24L27 58L31 54H55L52 61L55 67H34L30 63L26 67H5L8 61Z",
            seal: "M-1-5A5 5 0 1 0 4 3M2-4L0 0L3 1L1 5", sides: "M5 53V36L1 31L6 25M55 53V36L59 31L54 25", crown: "M12 17L7 9L18 11L22 4M48 17L53 9L42 11L38 4" },
        PAKELLAS: { color: "#bba87b", arch: "M8 55V23L14 13L20 9H40L46 13L52 23V55", base: "M5 55H55V59H52V63H55V67H5V63H8V59H5Z",
            seal: "M-2-4H2L3-2L5-1V1L3 2L2 4H-2L-3 2L-5 1V-1L-3-2ZM-1 0H1", sides: "M4 52V30H0V26H5M56 52V30H60V26H55", crown: "M12 17V8H17V4H22M48 17V8H43V4H38" },
        USKAYAW: { color: "#d49bbb", arch: "M8 55V27Q6 17 17 11L23 8H37L43 11Q54 17 52 27V55", base: "M5 55Q14 52 23 56L30 54L37 56Q46 52 55 55L52 61L55 67L40 65L30 67L20 65L5 67L8 61Z",
            seal: "M0-5V-3M-4-1L0-2L4-4M0-2L-1 1L3 5M-1 1L-5 4", sides: "M5 53Q0 49 4 44Q8 39 3 34M55 53Q60 49 56 44Q52 39 57 34", crown: "M12 17Q4 14 8 7L16 10L21 4M48 17Q56 14 52 7L44 10L39 4" },
        HEPLIAKLQANA: { color: "#a8c6b9", arch: "M8 55V25Q8 16 17 12L21 9L26 7H34L39 9L43 12Q52 16 52 25V55", base: "M5 55H17L20 53L24 55H36L40 53L43 55H55L52 67H8Z",
            seal: "M0-5V-3M-2 2V0Q0-3 2 0V2M-5 4V1M5 4V1M-2 4H2", sides: "M4 53V38Q0 35 4 32Q8 35 4 38M56 53V38Q52 35 56 32Q60 35 56 38", crown: "M12 17Q7 12 12 7L20 10L22 4M48 17Q53 12 48 7L40 10L38 4" },
        WU_JIAN: { color: "#c7a683", arch: "M8 55V26L12 19L18 12L23 8H37L42 12L48 19L52 26V55", base: "M4 56Q12 58 18 54H42Q48 58 56 56L53 61H50V67H10V61H7Z",
            seal: "M-5-2Q0 0 5-2M-3-2V3H3V-2M-5 4H5M0-5V-3", sides: "M4 53V27L0 25L5 23L9 25M56 53V27L60 25L55 23L51 25", crown: "M11 17L6 14Q14 15 20 8M49 17L54 14Q46 15 40 8M16 8L21 5M44 8L39 5" },
        IGNIS: { color: "#e4ac71", arch: "M8 55V26Q6 18 15 12L21 9L25 7H35L39 9L45 12Q54 18 52 26V55", base: "M5 55H55L52 61L54 64L49 67L39 65L30 67L21 65L11 67L6 64L8 61Z",
            seal: "M0-5Q3-1 1 0L4-2Q7 4 0 5Q-6 4-3-2L-1 0Z", sides: "M5 53Q0 49 4 43Q8 39 4 34L6 29M55 53Q60 49 56 43Q52 39 56 34L54 29", crown: "M12 17Q5 13 10 6L15 11L21 4M48 17Q55 13 50 6L45 11L39 4" }
    };
    shrines.VORR = {"color": "#b76b77","arch": "M8 55V25L12 17V11L22 8H38L48 11V17L52 25V55","base": "M5 55H25L28 58H32L35 55H55L52 60V65L48 67H12L8 65V60Z","seal": "M0-5Q-5 0-3 3L-1 5V-2M1-2V5L3 3Q5 0 0-5","sides": "M4 51V29L7 26M4 39H7L8 44V51M56 51V29L53 26M56 39H53L52 44V51","crown": "M12 17V11L20 6H25M48 17V11L40 6H35M28 5L30 2L32 5"};
    shrines.VELLUM = { color: "#d1bd8f", arch: "M8 55V24Q8 10 20 8H40Q52 10 52 24V55", base: "M5 55Q18 53 30 57Q42 53 55 55V65Q42 63 30 67Q18 63 5 65Z", seal: "M0-4Q-4-6-7-4V3Q-3 1 0 4Q3 1 7 3V-4Q4-6 0-4V4", sides: "M4 51V25L8 20M56 51V25L52 20", crown: "M12 16Q18 8 25 9M48 16Q42 8 35 9" };
    shrines.IMUS_THEA = { color: "#9ed6df", arch: "M8 55V23L17 11L30 5L43 11L52 23V55", base: "M5 55H55L52 67H8Z", seal: "M0-5L5 0L0 5L-5 0ZM0-5V5M-5 0H5", sides: "M4 51L8 46L4 41V24M56 51L52 46L56 41V24", crown: "M16 13L22 6L30 2L38 6L44 13" };
    shrines.GREAT_WYRM = { color: "#b3c88b", arch: "M8 55V24Q8 9 30 7Q52 9 52 24V55", base: "M5 55H55L51 67H9Z", seal: "M0-5A5 5 0 1 1-1-5L1-3", sides: "M5 52Q0 32 7 19M55 52Q60 32 53 19", crown: "M14 15Q20 4 30 5Q40 4 46 15" };
    shrines.AGRAPHEDE = { color: "#a8ba78", arch: "M8 55V26Q8 9 30 7Q52 9 52 26V55", base: "M5 55L17 53L23 56L30 54L37 56L43 53L55 55L51 67H9Z", seal: "M0-5V5M-5 0H5M-4-4L4 4M4-4L-4 4", sides: "M5 51L10 43L5 34L11 26M55 51L50 43L55 34L49 26", crown: "M12 17L20 7L30 3L40 7L48 17" };
    var plain = { color: "#8e969a", arch: "M8 55V27a22 20 0 0 1 44 0V55", base: "M7 55H53V67H7Z" };
    // Visual atmosphere, never additional gameplay state. These small families
    // share a bounded particle renderer while each deity retains its own craft.
    var atmosphere = {
        ZIN: ["spark", "twinkle", 12], SHINING_ONE: ["ray", "rise", 9],
        KIKUBAAQUDGHA: ["ash", "fall", 12], YREDELEMNUL: ["mist", "rise", 14],
        XOM: ["diamond", "wander", 9], VEHUMET: ["rune", "rise", 10],
        OKAWARU: ["spark", "twinkle", 12], MAKHLEB: ["ember", "rise", 8],
        SIF_MUNA: ["rune", "sway", 13], TROG: ["ember", "rise", 10],
        NEMELEX_XOBEH: ["diamond", "wander", 11], ELYVILON: ["feather", "sway", 14],
        LUGONU: ["rift", "wander", 12], BEOGH: ["spark", "rise", 13],
        JIYVA: ["drop", "fall", 13], FEDHAS: ["leaf", "fall", 15],
        CHEIBRIADOS: ["dust", "sway", 22], ASHENZARI: ["link", "twinkle", 15],
        DITHMENOS: ["mist", "sway", 17], GOZAG: ["coin", "twinkle", 12],
        QAZLAL: ["ray", "wander", 9], RU: ["dust", "rise", 17],
        PAKELLAS: ["spark", "twinkle", 12], USKAYAW: ["note", "sway", 10],
        HEPLIAKLQANA: ["mist", "rise", 16], WU_JIAN: ["leaf", "sway", 13],
        IGNIS: ["ember", "rise", 12]
    };
    atmosphere.VORR = ["drop", "fall", 13];
    atmosphere.VELLUM = ["spark", "twinkle", 12];
    atmosphere.IMUS_THEA = ["diamond", "twinkle", 12];
    atmosphere.GREAT_WYRM = ["drop", "rise", 14];
    atmosphere.AGRAPHEDE = ["spark", "twinkle", 12];
    var moteShapes = {
        spark: "M0-1.8V1.8M-1.8 0H1.8", ray: "M0-2L.6-.6L2 0L.6.6L0 2L-.6.6L-2 0L-.6-.6Z",
        ash: "M-.8-1L.8 1M.7-1L-.5.8", mist: "M-1.6.8Q-3-.2-1.2-1Q-.3-2 1-1Q3-.6 1.6.8Z",
        diamond: "M0-1.8L1.2 0L0 1.8L-1.2 0Z", rune: "M-1 1.5V-1.5L1-.5L-1 .5H1",
        ember: "M0-2Q2 .2.5 1.5Q-1 2-1.2.3Z", feather: "M-1.5 1.5Q-2-2 1.5-2Q2 .5-1.5 1.5ZM-1.5 1.5L.8-1",
        rift: "M.5-2L-1-.4L1 .2L-.5 2", drop: "M0-2Q3 1 0 2Q-3 1 0-2Z",
        leaf: "M-1.4 1.5Q-2-2 1.5-1.5Q2 2-1.4 1.5ZM-1 1L1-1", dust: "M-.5 0H.5",
        link: "M0-2L1.2 0L0 2L-1.2 0Z", coin: "M-1.4 0A1.4 1.4 0 1 0 1.4 0A1.4 1.4 0 1 0-1.4 0M0-.8V.8",
        note: "M0 1V-2L1.5-1M0 1Q-2 0-1.5 1.5Q0 2 0 1"
    };
    // A carved setting grows out of each pedestal rather than placing the
    // native altar on an independent icon tile. The native art stays untouched.
    var idolSettings = {
        ZIN: ["reliquary", "M-9 6V-4L-6-7H6L9-4V6L5 7H-5Z"],
        SHINING_ONE: ["sun", "M-9 5L-7-2L-9-4L-4-5L-3-8L0-6L3-8L4-5L9-4L7-2L9 5L5 7H-5Z"],
        KIKUBAAQUDGHA: ["bone", "M-9 6L-7 1L-9-3L-6-6L-3-7H3L6-6L9-3L7 1L9 6L4 7H-4Z"],
        YREDELEMNUL: ["tomb", "M-9 7L-7-3L-3-7H3L7-3L9 7Z"],
        XOM: ["chaos", "M-9 5L-7 0L-10-4L-3-5L0-8L4-5L9-6L7 0L10 5L2 7L-3 5Z"],
        VEHUMET: ["prism", "M-10 7L-6-3L0-8L6-3L10 7L0 5Z"],
        OKAWARU: ["shield", "M-9-5L0-7L9-5V2L5 7H-5L-9 2Z"],
        MAKHLEB: ["horn", "M-10 5L-7-1L-9-7L-4-4L0-6L4-4L9-7L7-1L10 5L5 7H-5Z"],
        SIF_MUNA: ["book", "M-10-5Q-5-7 0-4Q5-7 10-5V6Q5 4 0 7Q-5 4-10 6Z"],
        TROG: ["tusk", "M-10 5L-7 0L-9-6L-5-4L-4-7H4L5-4L9-6L7 0L10 5L5 7H-5Z"],
        NEMELEX_XOBEH: ["cards", "M-10 5L-8-6L-1-5L1-7L9-5L10 6L1 5L-1 7Z"],
        ELYVILON: ["wing", "M-10-5Q-8 1-4-1L0-6L4-1Q8 1 10-5L8 5Q4 7 0 5Q-4 7-8 5Z"],
        LUGONU: ["rift", "M-10 6L-7 0L-9-5L-3-4L0-7L4-5L10-6L7 1L10 6L2 5L-1 7Z"],
        BEOGH: ["iron", "M-10 6L-8-5L-5-3L-4-7H4L5-3L8-5L10 6L5 5L0 7L-5 5Z"],
        JIYVA: ["basin", "M-10-4Q-5-7 0-4Q5-7 10-4L8 5Q4 8 0 6Q-4 8-8 5Z"],
        FEDHAS: ["roots", "M-10 7L-7 1L-9-5L-4-4L0-7L4-4L9-5L7 1L10 7L4 5L0 7L-4 5Z"],
        CHEIBRIADOS: ["steps", "M-10 7V4H-8V-1H-6V-6H6V-1H8V4H10V7Z"],
        ASHENZARI: ["chain", "M-10 5L-8-3L-4-7L0-5L4-7L8-3L10 5L6 7L0 5L-6 7Z"],
        DITHMENOS: ["crescent", "M-10 5Q-13-5-4-7Q-7-2-5 1H5Q7-2 4-7Q13-5 10 5L5 7H-5Z"],
        GOZAG: ["vault", "M-10 7V-3L-6-7H6L10-3V7H5V5H-5V7Z"],
        QAZLAL: ["storm", "M-10 6L-8 0Q-12-5-6-5Q-3-9 0-6Q3-9 6-5Q12-5 8 0L10 6L3 7L0 5L-3 7Z"],
        RU: ["sacrifice", "M-10 7L-7-4L-3-7L0-4L3-7L7-4L10 7H3L0 4L-3 7Z"],
        PAKELLAS: ["mechanism", "M-10 7V3H-8V-3H-10V-6H-4V-8H4V-6H10V-3H8V3H10V7Z"],
        USKAYAW: ["lyre", "M-10-6Q-6-3-7 1L-4 5H4L7 1Q6-3 10-6L10 2L5 7H-5L-10 2Z"],
        HEPLIAKLQANA: ["memory", "M-10 7V-3L-6-6L-3-4L0-8L3-4L6-6L10-3V7L5 5L0 7L-5 5Z"],
        WU_JIAN: ["pagoda", "M-11-3Q-4-3 0-8Q4-3 11-3L8 0H6V5H9V7H-9V5H-6V0L-8 0Z"],
        IGNIS: ["brazier", "M-10-5L-5-3L0-7L5-3L10-5L7 4L3 5V7H-3V5L-7 4Z"]
    };
    idolSettings.VORR = ["blood-basin", "M-10-4L-7-6H7L10-4L8 4L4 7H-4L-8 4Z"];
    idolSettings.VELLUM = ["book", "M0-5Q-5-7-9-5V4Q-4 2 0 5Q4 2 9 4V-5Q5-7 0-5V5"];
    idolSettings.IMUS_THEA = ["prism", "M0-8L9 3L5 7H-5L-9 3Z"];
    idolSettings.GREAT_WYRM = ["serpent", "M0-8A8 8 0 1 1-1-8L2-5L-1-3Z"];
    idolSettings.AGRAPHEDE = ["spider", "M-4-3L-10-7M-4 0H-11M-4 3L-10 7M4-3L10-7M4 0H11M4 3L10 7M0-5A4 4 0 1 0 0 5A4 4 0 1 0 0-5Z"];
    var namespace = "http://www.w3.org/2000/svg";
    var craftId = 0;

    function node(tag, attributes) {
        var element = document.createElementNS(namespace, tag);
        Object.keys(attributes || {}).forEach(function (key) { element.setAttribute(key, attributes[key]); });
        return element;
    }
    function path(parent, className, data) {
        if (!data) return null;
        var element = node("path", { "class": className, d: data });
        parent.appendChild(element); return element;
    }
    function layer(frame, name, tier, shown) {
        var group = node("g", { "class": "faith-craft faith-" + name, "data-min-tier": tier });
        if (!shown) group.setAttribute("display", "none");
        frame.appendChild(group); return group;
    }
    function phase(period, offset) {
        var elapsed = typeof performance !== "undefined" ? performance.now() / 1000 : 0;
        return -((elapsed + (offset || 0)) % period) + "s";
    }
    function material(svg, name, stops) {
        var id = "faith-" + name + "-" + craftId;
        var gradient = node("linearGradient", { id: id, x1: "0", y1: "0", x2: "0", y2: "1" });
        stops.forEach(function (stop) {
            gradient.appendChild(node("stop", { offset: stop[0], "class": "faith-material-" + stop[1] }));
        });
        svg.querySelector("defs").appendChild(gradient); return "url(#" + id + ")";
    }
    function particles(svg, faith, effect) {
        var count = !faith.worships || faith.penance || faith.kind === "piety" && faith.rank === null ? 0
            : faith.kind !== "piety" ? 3 : faith.rank;
        if (!count || !effect) return;
        var group = node("g", { "class": "faith-particles", "data-particle-theme": effect[0] });
        // Fixed anchors keep particles off the portrait, compass and name.
        var anchors = [[5, 51], [55, 45], [3, 36], [57, 32], [6, 25], [54, 20]];
        for (var i = 0; i < count; i++) {
            var anchor = node("g", { transform: "translate(" + anchors[i].join(" ") + ")" });
            var particle = node("g", { "class": "faith-particle faith-motion-" + effect[1] });
            var period = effect[2] + i * .7;
            particle.style.setProperty("--faith-particle-delay", phase(period, i * 2.7 + 1.1));
            particle.style.setProperty("--faith-particle-period", period + "s");
            path(particle, "faith-mote faith-mote-" + effect[0], moteShapes[effect[0]]);
            anchor.appendChild(particle); group.appendChild(anchor);
        }
        svg.appendChild(group);
    }
    function frame(faith, theme, effect, setting) {
        var svg = node("svg", { "class": "party-faith-frame", viewBox: "0 0 60 68", "aria-hidden": "true" });
        craftId++;
        svg.appendChild(node("defs"));
        var metal = material(svg, "metal", [["0", "light"], [".18", "accent"], [".46", "shade"], [".55", "light"], ["1", "accent"]]);
        var stone = material(svg, "stone", [["0", "stone-light"], [".24", "stone"], [".7", "stone"], ["1", "stone-dark"]]);
        var tier = faith.rank === null ? 0 : faith.rank;
        // These two gods have a fixed identity treatment, never a fabricated tier.
        var special = faith.worships && faith.kind !== "piety";
        path(svg, "faith-arch-shadow", theme.arch);
        path(svg, "faith-plinth-shadow", theme.base);
        path(svg, "faith-frame-structure", theme.arch).style.stroke = metal;
        path(svg, "faith-plinth-stone", theme.base).style.fill = stone;
        path(svg, "faith-plinth-bevel", theme.base).style.stroke = metal;
        if (setting) {
            var socket = node("g", { "class": "faith-idol-setting", "data-faith-setting": setting[0], transform: "translate(30 62)" });
            path(socket, "faith-idol-recess", setting[1]).style.fill = stone;
            path(socket, "faith-idol-rim", setting[1]).style.stroke = metal;
            path(socket, "faith-idol-seat", "M-5 6Q0 4 5 6");
            svg.appendChild(socket);
        }
        var carving = layer(svg, "carving", 1, faith.worships);
        [-1, 1].forEach(function (side) {
            var seal = node("g", { transform: "translate(" + (30 + side * 17) + " 61) scale(.7)" });
            path(seal, "faith-seal-recess", theme.seal);
            path(seal, "faith-seal", theme.seal); carving.appendChild(seal);
        });
        path(layer(svg, "fittings", 2, tier >= 2 || special), "faith-fitting",
            "M8 54L10 52L12 54L10 56ZM48 54L50 52L52 54L50 56Z");
        path(layer(svg, "devotion", 3, tier >= 3 || special), "faith-deity-ornament", theme.sides);
        path(layer(svg, "crown", 4, tier >= 4 || special), "faith-deity-crown", theme.crown);
        path(layer(svg, "sanctuary", 5, tier >= 5), "faith-inner-arch", "M11 50V27Q11 13 24 11M49 50V27Q49 13 36 11");
        var glory = layer(svg, "glory", 6, tier >= 6);
        path(glory, "faith-halo", "M2 54V26Q1 17 7 11M58 54V26Q59 17 53 11");
        [6, 54].forEach(function (x) {
            var jewel = node("g", { transform: "translate(" + x + " 19)" });
            path(jewel, "faith-jewel", "M0-3L2 0L0 3L-2 0Z"); glory.appendChild(jewel);
        });
        particles(svg, faith, effect);
        if (faith.penance) path(svg, "faith-fracture", "M5 56L10 60L7 63L13 67M55 56L50 60L53 63L47 67");
        return svg;
    }
    function altar($button, faith) {
        var index = faith.altar && tiles[faith.altar], image = document.getElementById("feat");
        if (!Number.isInteger(index) || !image) return;
        function draw() {
            if (!$button[0].isConnected || !image.naturalWidth) return;
            var info = tiles.get_tile_info(index);
            if (!info) return;
            var canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
            canvas.className = "party-faith-art";
            canvas.setAttribute("aria-hidden", "true");
            var context = canvas.getContext("2d");
            if (!context) return;
            context.imageSmoothingEnabled = false;
            context.drawImage(image, info.sx, info.sy, info.ex - info.sx, info.ey - info.sy,
                info.ox + 16 - info.w / 2, info.oy + 32 - info.h, info.ex - info.sx, info.ey - info.sy);
            var fallback = $button[0].querySelector(".party-faith-art");
            if (fallback) fallback.replaceWith(canvas);
            $button.attr("data-faith-art", "native");
        }
        if (image.complete) requestAnimationFrame(draw);
        else image.addEventListener("load", draw, { once: true });
    }
    function badge(hero, faith, inspect) {
        var state = !faith.known ? "unknown" : faith.penance ? "penance" : faith.worships ? "devout" : "unaffiliated";
        var $button = $("<button type='button' class='party-status-icon party-faith'></button>")
            .addClass("is-" + state)
            .attr({ id: "party_faith_" + hero.slot, "aria-label": hero.name + ": " + faith.name + ". " + faith.summary,
                "data-faith-kind": faith.kind, "data-faith-standing": faith.standing,
                "data-tip-title": faith.name, "data-tip-body": [faith.summary, faith.description].filter(Boolean).join("\n"),
                "data-tip-meta": "Inspect faith and divine abilities" })
            .append($("<span class='party-faith-art' aria-hidden='true'></span>")
                .append(icons.icon(!faith.known ? "question" : faith.kind === "defiance" ? "spark" : faith.worships ? "faith" : "faith-none")))
            .on("click", function (event) { event.stopPropagation(); inspect(hero.slot, faith.worships || faith.kind === "defiance" ? "abilities" : "overview"); })
            .on("keydown keypress keyup", function (event) { event.stopPropagation(); });
        if (faith.worships) altar($button, faith);
        if (faith.penance || faith.standing !== "none") {
            $button.append($("<span class='party-faith-mark' aria-hidden='true'></span>")
                .append(icons.icon(faith.penance || faith.standing === "rival" ? "danger" : "chain")));
        }
        $button.attr("data-tip-faith-base", $button.attr("data-tip-body"));
        return $button;
    }
    function portrait(hero, compass, inspect) {
        var faith = model.faith(hero), key = (faith.altar || "").replace("DNGN_ALTAR_", "");
        var theme = shrines[key] || plain;
        var $portrait = $("<div class='party-portrait'></div>")
            .attr({ "data-faith-god": faith.worships ? key : "NONE",
                "data-faith-tier": faith.rank === null ? "unknown" : faith.rank,
                "data-faith-kind": faith.kind, "data-faith-standing": faith.standing,
                "data-faith-atmosphere": atmosphere[key] ? atmosphere[key][0] : "none",
                "data-faith-motion": faith.penance || !faith.worships ? "still" : faith.kind !== "piety" ? "identity"
                    : faith.rank === null || faith.rank === 0 ? "still" : faith.rank < 4 ? "quiet" : "radiant",
                "data-faith-state": !faith.known ? "unknown" : faith.penance ? "penance" : faith.worships ? "devout" : "none" })
            .append(compass, frame(faith, theme, atmosphere[key], idolSettings[key]), badge(hero, faith, inspect));
        // The native client ships jQuery 1.8; custom properties require CSSOM.
        $portrait[0].style.setProperty("--faith-accent", theme.color);
        $portrait[0].style.setProperty("--faith-ambient-delay", phase(9, hero.slot * .7));
        return $portrait;
    }
    return { portrait: portrait };
});
