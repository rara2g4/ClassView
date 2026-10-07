(() => {
  "use strict";

  const periods = [
    { id: 1, label: "1限", time: "9:20 - 10:50" },
    { id: 2, label: "2限", time: "11:00 - 12:30" },
    { id: 3, label: "3限", time: "13:30 - 15:00" },
    { id: 4, label: "4限", time: "15:10 - 16:40" },
  ];

  const days = [
    { id: "mon", short: "月", label: "月曜日" },
    { id: "tue", short: "火", label: "火曜日" },
    { id: "wed", short: "水", label: "水曜日" },
    { id: "thu", short: "木", label: "木曜日" },
    { id: "fri", short: "金", label: "金曜日" },
  ];

  // Human UX review用の明示的なmock分類。授業名からruntime推論しない。
  // xlsx-13（VR制作）は、未確認categoryの挙動を確認するため意図的に未設定。
  const categories = [
    "プログラミング・Web・情報システム",
    "AI・データ",
    "ネットワーク・セキュリティ",
    "デザイン・写真・映像",
    "3DCG・VR",
    "ゲーム制作",
    "eスポーツ・配信・イベント",
    "ドローン・ロボット・ものづくり",
    "総合制作・プロジェクト",
    "キャリア・資格・基礎教養",
  ];
  const categoryAssignments = new Map();
  [
    [categories[0], ["xlsx-09", "xlsx-24", "xlsx-25", "xlsx-28", "xlsx-30", "xlsx-35", "xlsx-50", "xlsx-51", "xlsx-54", "xlsx-55", "xlsx-60"]],
    [categories[1], ["xlsx-08", "xlsx-38", "xlsx-41", "xlsx-57"]],
    [categories[2], ["xlsx-07", "xlsx-31", "xlsx-43", "xlsx-56", "xlsx-62", "xlsx-66"]],
    [categories[3], ["xlsx-05", "xlsx-21", "xlsx-27", "xlsx-32", "xlsx-36", "xlsx-37", "xlsx-45", "xlsx-53", "xlsx-59", "xlsx-63"]],
    [categories[4], ["xlsx-18", "xlsx-61"]],
    [categories[5], ["xlsx-06", "xlsx-12", "xlsx-39", "xlsx-42"]],
    [categories[6], ["xlsx-04", "xlsx-14", "xlsx-26", "xlsx-40", "xlsx-44", "xlsx-46", "xlsx-58"]],
    [categories[7], ["xlsx-01", "xlsx-02", "xlsx-03", "xlsx-10", "xlsx-11", "xlsx-15", "xlsx-16", "xlsx-22", "xlsx-23", "xlsx-48", "xlsx-49"]],
    [categories[8], ["xlsx-20", "xlsx-29", "xlsx-33", "xlsx-52", "xlsx-65"]],
    [categories[9], ["xlsx-17", "xlsx-19", "xlsx-34", "xlsx-47", "xlsx-64"]],
  ].forEach(([category, courseIds]) => {
    courseIds.forEach((courseId) => categoryAssignments.set(courseId, category));
  });

  // UX stress test only. The source workbook has no courseType column, so these
  // labels are synthetic visual states and must not be treated as school facts.
  const stressCourseTypes = new Map([
    ["xlsx-06", "選択必修"],
    ["xlsx-08", "選択"],
    ["xlsx-10", "必修"],
    ["xlsx-11", "選択必修"],
    ["xlsx-13", "選択"],
    ["xlsx-22", "必修"],
    ["xlsx-37", "選択"],
    ["xlsx-41", "選択必修"],
  ]);

  const courses = [];
  const addCourse = ({ id, title, instructor, grades, slots, note = "" }) => {
    slots.forEach(([day, period]) => courses.push({
      id,
      entryId: `${id}-${day}-${period}`,
      title,
      day,
      period,
      courseType: stressCourseTypes.get(id) || null,
      category: categoryAssignments.get(id) || null,
      sourceCourseType: null,
      courseTypeIsSynthetic: stressCourseTypes.has(id),
      grades,
      groups: ["all"],
      instructor,
      note,
    }));
  };

  // Source: 時間割2026後期.xlsx / Page001!A1:V46。
  // 表示上の全角英数字だけNFKC相当に整え、[A]〜[F]等は授業名の一部として保持する。
  addCourse({ id: "xlsx-01", title: "ドローン基礎", instructor: "CDP", grades: ["1"], slots: [["mon", 1], ["mon", 2]] });
  addCourse({ id: "xlsx-02", title: "モノづくり1", instructor: "橋口・阿部", grades: ["1"], slots: [["mon", 1], ["mon", 2], ["mon", 3], ["mon", 4]] });
  addCourse({ id: "xlsx-03", title: "モノづくり3", instructor: "橋口・阿部", grades: ["2"], slots: [["mon", 1], ["mon", 2], ["mon", 3], ["mon", 4]] });
  addCourse({ id: "xlsx-04", title: "MOBA1・3", instructor: "細川亮", grades: ["1", "2"], slots: [["mon", 1], ["mon", 2]] });
  addCourse({ id: "xlsx-05", title: "Photoshop1・3", instructor: "中野", grades: ["1", "2"], slots: [["mon", 1], ["mon", 2]] });
  addCourse({ id: "xlsx-06", title: "ゲーム制作1・3・[E]", instructor: "蒲田", grades: ["1", "2", "3"], slots: [["mon", 1], ["mon", 2]] });
  addCourse({ id: "xlsx-07", title: "セキュリティ概論", instructor: "BSC/IBM", grades: ["1"], slots: [["mon", 1]] });
  addCourse({ id: "xlsx-08", title: "AI応用2", instructor: "工藤健吾", grades: ["2"], slots: [["tue", 1], ["tue", 2]] });
  addCourse({ id: "xlsx-09", title: "Python1", instructor: "成田", grades: ["1"], slots: [["tue", 1], ["tue", 2]] });
  addCourse({ id: "xlsx-10", title: "ドローン応用2", instructor: "CDP", grades: ["2", "3"], slots: [["tue", 1], ["tue", 2], ["tue", 3], ["tue", 4]] });
  addCourse({ id: "xlsx-11", title: "ドローン応用[D]", instructor: "CDP", grades: ["2", "3"], slots: [["tue", 1], ["tue", 2], ["tue", 3], ["tue", 4]] });
  addCourse({ id: "xlsx-12", title: "ゲームデザイン1", instructor: "斉藤", grades: ["1"], slots: [["tue", 1], ["tue", 2]] });
  addCourse({ id: "xlsx-13", title: "VR制作1・3・[E]", instructor: "小野寺", grades: ["1", "2", "3"], slots: [["tue", 1], ["tue", 2]] });
  addCourse({ id: "xlsx-14", title: "eスポーツ基礎", instructor: "PCCS", grades: ["1"], slots: [["tue", 1], ["tue", 2]] });
  addCourse({ id: "xlsx-15", title: "ロボット工学1", instructor: "覺張", grades: ["1"], slots: [["wed", 1], ["wed", 2]], note: "隔週" });
  addCourse({ id: "xlsx-16", title: "CAD/CAM演習1", instructor: "西川", grades: ["1"], slots: [["wed", 1], ["wed", 2]], note: "隔週" });
  addCourse({ id: "xlsx-17", title: "基本情報1", instructor: "本多", grades: ["1"], slots: [["wed", 1], ["wed", 2]] });
  addCourse({ id: "xlsx-18", title: "Blender1", instructor: "澤井", grades: ["1"], slots: [["wed", 1], ["wed", 2]] });
  addCourse({ id: "xlsx-19", title: "キャリアデザイン4", instructor: "専任", grades: ["2"], slots: [["wed", 1]] });
  addCourse({ id: "xlsx-20", title: "進級制作3", instructor: "専任", grades: ["2"], slots: [["wed", 1]] });
  addCourse({ id: "xlsx-21", title: "デザイン制作2・[D]", instructor: "菊池・深沢", grades: ["2", "3"], slots: [["thu", 1], ["thu", 2]] });
  addCourse({ id: "xlsx-22", title: "ドローン特講[B]", instructor: "CDP", grades: ["3"], slots: [["thu", 1], ["thu", 2]] });
  addCourse({ id: "xlsx-23", title: "制御プログラミング基礎", instructor: "蒲田", grades: ["1"], slots: [["thu", 1], ["thu", 2]] });
  addCourse({ id: "xlsx-24", title: "システム設計", instructor: "松山", grades: ["1"], slots: [["thu", 1], ["thu", 2]], note: "隔週" });
  addCourse({ id: "xlsx-25", title: "Java2", instructor: "松山", grades: ["2"], slots: [["thu", 1], ["thu", 2]], note: "隔週" });
  addCourse({ id: "xlsx-26", title: "FPS1・3", instructor: "辻", grades: ["1", "2"], slots: [["thu", 1], ["thu", 2]] });
  addCourse({ id: "xlsx-27", title: "撮影基礎1・3", instructor: "松田", grades: ["1", "2"], slots: [["fri", 1], ["fri", 2]] });
  addCourse({ id: "xlsx-28", title: "Python3", instructor: "成田", grades: ["2"], slots: [["fri", 1], ["fri", 2]] });
  addCourse({ id: "xlsx-29", title: "ポートフォリオ", instructor: "深沢", grades: ["2"], slots: [["fri", 1], ["fri", 2]] });
  addCourse({ id: "xlsx-30", title: "アルゴリズム1・2", instructor: "レーザーシステム", grades: ["1", "2"], slots: [["mon", 2]] });
  addCourse({ id: "xlsx-31", title: "セキュリティマネジメント", instructor: "阿部", grades: ["2"], slots: [["tue", 2]] });
  addCourse({ id: "xlsx-32", title: "デッサン1", instructor: "戸山", grades: ["1"], slots: [["tue", 2]] });
  addCourse({ id: "xlsx-33", title: "進級制作4", instructor: "専任", grades: ["2"], slots: [["wed", 2]] });
  addCourse({ id: "xlsx-34", title: "キャリアデザイン[F]", instructor: "専任", grades: ["3"], slots: [["wed", 2]] });
  addCourse({ id: "xlsx-35", title: "SQL", instructor: "細川聡", grades: ["1"], slots: [["fri", 2]] });
  addCourse({ id: "xlsx-36", title: "デザイン企画1", instructor: "深沢", grades: ["1"], slots: [["mon", 3]] });
  addCourse({ id: "xlsx-37", title: "動画編集2・AfterEffects[C]・自由選択", instructor: "中野", grades: ["2", "3"], slots: [["mon", 3], ["mon", 4]] });
  addCourse({ id: "xlsx-38", title: "AI基礎", instructor: "成田", grades: ["1"], slots: [["mon", 3], ["mon", 4]] });
  addCourse({ id: "xlsx-39", title: "Unity1", instructor: "蒲田", grades: ["1"], slots: [["mon", 3], ["mon", 4]] });
  addCourse({ id: "xlsx-40", title: "イベント企画・運営2・[D]", instructor: "eek", grades: ["2", "3"], slots: [["mon", 3], ["mon", 4]] });
  addCourse({ id: "xlsx-41", title: "AI開発[B]", instructor: "工藤健吾", grades: ["3"], slots: [["tue", 3], ["tue", 4]] });
  addCourse({ id: "xlsx-42", title: "ゲームデザイン3", instructor: "斉藤", grades: ["2"], slots: [["tue", 3], ["tue", 4]] });
  addCourse({ id: "xlsx-43", title: "情報セキュリティ演習2・[E]", instructor: "阿部", grades: ["2", "3"], slots: [["tue", 3], ["tue", 4]] });
  addCourse({ id: "xlsx-44", title: "プラットフォーム", instructor: "小野寺", grades: ["1"], slots: [["tue", 3]] });
  addCourse({ id: "xlsx-45", title: "デッサン3", instructor: "戸山", grades: ["2"], slots: [["tue", 3]] });
  addCourse({ id: "xlsx-46", title: "eスポーツ配信2・配信[D]", instructor: "PCCS", grades: ["2", "3"], slots: [["tue", 3], ["tue", 4]] });
  addCourse({ id: "xlsx-47", title: "コミュニケーション2", instructor: "先名", grades: ["1"], slots: [["tue", 3]] });
  addCourse({ id: "xlsx-48", title: "ロボット工学3", instructor: "覺張", grades: ["2"], slots: [["wed", 3], ["wed", 4]], note: "隔週" });
  addCourse({ id: "xlsx-49", title: "CAD/CAM演習3", instructor: "西川", grades: ["2"], slots: [["wed", 3], ["wed", 4]], note: "隔週" });
  addCourse({ id: "xlsx-50", title: "HTML/CSS", instructor: "萩原", grades: ["1"], slots: [["wed", 3], ["wed", 4]], note: "隔週" });
  addCourse({ id: "xlsx-51", title: "PHP2", instructor: "細川聡", grades: ["2"], slots: [["wed", 3]] });
  addCourse({ id: "xlsx-52", title: "卒業制作[C]", instructor: "専任", grades: ["3"], slots: [["wed", 3]] });
  addCourse({ id: "xlsx-53", title: "デザイン基礎", instructor: "菊池・深沢", grades: ["1"], slots: [["thu", 3], ["thu", 4]] });
  addCourse({ id: "xlsx-54", title: "WEB制作・WEB制作[D]", instructor: "長濱", grades: ["2", "3"], slots: [["thu", 3], ["thu", 4]] });
  addCourse({ id: "xlsx-55", title: "C#1・2", instructor: "蒲田", grades: ["1", "2"], slots: [["thu", 3], ["thu", 4]] });
  addCourse({ id: "xlsx-56", title: "セキュリティ応用", instructor: "齋藤", grades: ["2"], slots: [["thu", 3], ["thu", 4]] });
  addCourse({ id: "xlsx-57", title: "統計応用", instructor: "尻枝", grades: ["2"], slots: [["thu", 3], ["thu", 4]] });
  addCourse({ id: "xlsx-58", title: "FTG1・3", instructor: "ビックマンプロジェクト", grades: ["1", "2"], slots: [["thu", 3], ["thu", 4]] });
  addCourse({ id: "xlsx-59", title: "Illustrator1・3", instructor: "深沢", grades: ["1", "2"], slots: [["fri", 3], ["fri", 4]] });
  addCourse({ id: "xlsx-60", title: "システム開発2・[D]", instructor: "成田", grades: ["2", "3"], slots: [["fri", 3], ["fri", 4]] });
  addCourse({ id: "xlsx-61", title: "Blender3", instructor: "大澤", grades: ["2"], slots: [["fri", 3], ["fri", 4]] });
  addCourse({ id: "xlsx-62", title: "Linux", instructor: "細川聡", grades: ["1"], slots: [["fri", 3]] });
  addCourse({ id: "xlsx-63", title: "デッサン[E]", instructor: "戸山", grades: ["3"], slots: [["tue", 4]] });
  addCourse({ id: "xlsx-64", title: "キャリアデザイン2", instructor: "専任", grades: ["1"], slots: [["tue", 4]] });
  addCourse({ id: "xlsx-65", title: "卒業制作[D]", instructor: "専任", grades: ["3"], slots: [["wed", 4]] });
  addCourse({ id: "xlsx-66", title: "ネットワークシステム", instructor: "細川聡", grades: ["1"], slots: [["fri", 4]] });

  const typeLabel = (value) => value || "区分未確認";
  const slotKey = (course) => `${course.day}-${course.period}`;

  window.PersonalTimetableMock = {
    periods,
    days,
    categories,
    courses,
    typeLabel,
    slotKey,
    stressSlotKey: "tue-2",
    stressSelectedCourseIds: ["xlsx-08", "xlsx-09"],
  };
})();
