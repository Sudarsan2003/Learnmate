// Kannada text for printed report cards, shown under the English when a
// teacher picks "English + ಕನ್ನಡ" (see ReportCard in Reports.jsx), so parents
// can read the card in either language.

export const CARD_LANGS = [
  { value: "en", label: "English" },
  { value: "en-kn", label: "English + ಕನ್ನಡ (Kannada)" },
];

export const KN = {
  progressReport: "ಪ್ರಗತಿ ವರದಿ",
  student: "ವಿದ್ಯಾರ್ಥಿ",
  username: "ಬಳಕೆದಾರ ಹೆಸರು",
  class: "ತರಗತಿ",
  period: "ಅವಧಿ",
  quizAverage: "ರಸಪ್ರಶ್ನೆ ಸರಾಸರಿ",
  quizzesTaken: "ಪ್ರಯತ್ನಿಸಿದ ರಸಪ್ರಶ್ನೆಗಳು",
  practiceQuizzes: "ಅಭ್ಯಾಸ ರಸಪ್ರಶ್ನೆಗಳು",
  gameStars: "ಆಟದ ನಕ್ಷತ್ರಗಳು",
  classQuizzes: "ತರಗತಿ ರಸಪ್ರಶ್ನೆಗಳು",
  quiz: "ರಸಪ್ರಶ್ನೆ",
  subject: "ವಿಷಯ",
  date: "ದಿನಾಂಕ",
  score: "ಅಂಕಗಳು",
  placeInClass: "ತರಗತಿಯಲ್ಲಿ ಸ್ಥಾನ",
  notAttempted: "ಪ್ರಯತ್ನಿಸಿಲ್ಲ",
  noQuizzes: "ಈ ಅವಧಿಯಲ್ಲಿ ಈ ತರಗತಿಗೆ ಯಾವುದೇ ರಸಪ್ರಶ್ನೆ ನೀಡಿಲ್ಲ.",
  remark: "ಅಭಿಪ್ರಾಯ",
  teachersComments: "ಶಿಕ್ಷಕರ ಟಿಪ್ಪಣಿ",
  classTeacher: "ತರಗತಿ ಶಿಕ್ಷಕರು",
  parentGuardian: "ಪೋಷಕರು / ರಕ್ಷಕರು",
  allTime: "ಎಲ್ಲಾ ಅವಧಿ",
  firstInClass: "ತರಗತಿಯಲ್ಲಿ 1ನೇ",
  second: "2ನೇ",
  third: "3ನೇ",
};

export function remarkKn(avg) {
  if (avg == null) return "ಈ ಅವಧಿಯಲ್ಲಿ ಯಾವುದೇ ರಸಪ್ರಶ್ನೆ ಬರೆದಿಲ್ಲ.";
  if (avg >= 85) return "ಅತ್ಯುತ್ತಮ ಸಾಧನೆ. ಹೀಗೆಯೇ ಮುಂದುವರಿಸಿ!";
  if (avg >= 70) return "ಉತ್ತಮ ಪ್ರಗತಿ; ಹೆಚ್ಚಿನ ವಿಷಯಗಳ ಮೇಲೆ ಒಳ್ಳೆಯ ಹಿಡಿತವಿದೆ.";
  if (avg >= 50) return "ತೃಪ್ತಿಕರ. ನಿಯಮಿತ ಪುನರಾವರ್ತನೆಯಿಂದ ಅಂಕಗಳು ಹೆಚ್ಚುತ್ತವೆ.";
  return "ಹೆಚ್ಚಿನ ಬೆಂಬಲ ಬೇಕು. ದಯವಿಟ್ಟು ಮನೆಯಲ್ಲಿ ನಿಯಮಿತ ಅಭ್ಯಾಸಕ್ಕೆ ಪ್ರೋತ್ಸಾಹಿಸಿ.";
}

/** "2nd of 30" in Kannada: "30 ರಲ್ಲಿ 2ನೇ". */
export const placeKn = (rank, of) => `${of} ರಲ್ಲಿ ${rank}ನೇ`;

/** Period, given the already-formatted dates. */
export function periodKn(from, to) {
  if (!from && !to) return KN.allTime;
  if (from && to) return `${from} ರಿಂದ ${to} ರವರೆಗೆ`;
  return from ? `${from} ರಿಂದ` : `${to} ರವರೆಗೆ`;
}

export function practiceNoteKn(count, average) {
  return `AI ಬೋಧಕರೊಂದಿಗೆ ${count} ಅಭ್ಯಾಸ ${count === 1 ? "ರಸಪ್ರಶ್ನೆಯನ್ನು" : "ರಸಪ್ರಶ್ನೆಗಳನ್ನು"} ಪೂರ್ಣಗೊಳಿಸಿದ್ದಾರೆ`
    + (average != null ? `, ಸರಾಸರಿ ${average}%.` : ".");
}

export const printedKn = (date) => `LearnMate ನಿಂದ ${date} ರಂದು ಮುದ್ರಿಸಲಾಗಿದೆ`;
