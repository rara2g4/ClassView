"""Stable configuration for ClassView learner-feedback imports."""

from __future__ import annotations


def _column(label: str, canonical: str, *aliases: str) -> dict[str, object]:
    """Keep staff labels separate from external Google Forms wording."""

    return {"label": label, "canonical": canonical, "aliases": aliases}


# Google Forms question text is intentionally kept in one place.  When the
# meaning of a question stays the same but its wording changes, add the old or
# new wording to ``aliases`` instead of changing aggregation code.
FEEDBACK_COLUMNS: dict[str, dict[str, object]] = {
    "timestamp": _column("タイムスタンプ", "タイムスタンプ", "Timestamp"),
    "course_id": _column("授業ID", "授業ID", "courseId", "Course ID"),
    "course_title": _column("授業名", "授業名", "Course title"),
    "academic_year": _column("年度", "年度", "Academic year"),
    "attended": _column("受講確認", "この授業を実際に受講しましたか？"),
    "prior_experience": _column("受講前の知識・経験", "受講前、この分野についてどの程度の知識・経験がありましたか？"),
    "content_understanding": _column("内容を理解できた", "授業で扱った内容を理解できたと感じますか？"),
    "independent_application": _column("知識・技術を自分で使えるようになった", "授業で学んだ知識や技術を、自分で使えるようになったと感じますか？"),
    "skill_growth": _column("受講前より知識・技能が身についた", "授業を受ける前と比べて、知識や技能が身についたと感じますか？"),
    "goal_achievement": _column("到達目標を達成できた", "この授業で示されていた到達目標を達成できたと感じますか？"),
    "explanation_clarity": _column("説明の分かりやすさ", "講師の説明は理解しやすかったですか？"),
    "practice_usefulness": _column("実例・演習の有用性", "実例・実演・演習は、授業内容を理解するうえで役立ちましたか？"),
    "question_support": _column("質問への対応", "分からない点について質問した際、十分な説明や支援がありましたか？"),
    "material_usefulness": _column("教材・資料の有用性", "授業で使用した教材・資料は、授業内容を理解するうえで役立ちましたか？"),
    "assignment_usefulness": _column("課題・制作物の有用性", "課題や制作物は、授業内容の理解や技能の習得につながっていましたか？"),
    "syllabus_alignment": _column("シラバス・ClassViewとの一致", "シラバスやClassViewに記載されている授業内容と、実際の授業内容は一致していましたか？"),
    "pace": _column("授業速度", "授業の進行速度をどのように感じましたか？"),
    "difficulty": _column("難易度", "この授業の難易度をどのように感じましたか？"),
    "workload": _column("課題量", "この授業の課題・制作物の量をどのように感じましたか？"),
    "class_style": _column("授業形式", "実際の授業に当てはまるものをすべて選んでください。"),
    "gained_skills_text": _column("できるようになったこと", "この授業を受ける前にはできなかったが、受講後にできるようになったこと・理解できるようになったことがあれば、具体的に教えてください。"),
    "helpful_points_text": _column("特に役立ったこと", "理解や技能習得に特に役立った授業内容・説明・演習・教材などがあれば教えてください。"),
    "improvement_text": _column("改善してほしいこと", "理解しにくかった点や、授業方法・教材・課題などで改善してほしい点があれば教えてください。"),
    "content_concern_text": _column(
        "専門内容について気になった点",
        "授業で扱われた内容について、「古い情報ではないか」「他で学んだ内容と矛盾している」「説明に誤りがあるのではないか」など、気になった点があれば具体的に教えてください。",
        "授業で扱われた内容について、『古い情報ではないか』『他で学んだ内容と矛盾している』『説明に誤りがあるのではないか』など、気になった点があれば具体的に教えてください。",
        "授業内容について、専門的に気になった点があれば具体的に教えてください。",
    ),
    "other_text": _column("その他", "その他、授業改善の参考になる意見があれば教えてください。"),
}

FREE_TEXT_KEYS = (
    "gained_skills_text",
    "helpful_points_text",
    "improvement_text",
    "content_concern_text",
    "other_text",
)
REQUIRED_COLUMNS = tuple(key for key in FEEDBACK_COLUMNS if key not in FREE_TEXT_KEYS)
OPTIONAL_COLUMNS = tuple(key for key in FEEDBACK_COLUMNS if key in FREE_TEXT_KEYS)
DIRECT_SCALE_KEYS = (
    "prior_experience",
    "content_understanding",
    "independent_application",
    "skill_growth",
    "goal_achievement",
    "explanation_clarity",
    "syllabus_alignment",
)
CONDITIONAL_SCALE_OPTIONS = {
    "practice_usefulness": {
        "まったく役立たなかった": 1,
        "あまり役立たなかった": 2,
        "どちらともいえない": 3,
        "役立った": 4,
        "とても役立った": 5,
        "実例・実演・演習はなかった": None,
    },
    "question_support": {
        "まったく十分ではなかった": 1,
        "あまり十分ではなかった": 2,
        "どちらともいえない": 3,
        "十分だった": 4,
        "とても十分だった": 5,
        "質問していない": None,
    },
    "material_usefulness": {
        "まったく役立たなかった": 1,
        "あまり役立たなかった": 2,
        "どちらともいえない": 3,
        "役立った": 4,
        "とても役立った": 5,
        "教材・資料はほとんど使用しなかった": None,
    },
    "assignment_usefulness": {
        "まったくつながっていなかった": 1,
        "あまりつながっていなかった": 2,
        "どちらともいえない": 3,
        "つながっていた": 4,
        "とてもつながっていた": 5,
        "課題・制作物はなかった": None,
    },
}

CHOICE_OPTIONS = {
    "attended": ("はい", "いいえ"),
    "pace": ("遅すぎた", "やや遅かった", "ちょうどよかった", "やや速かった", "速すぎた"),
    "difficulty": ("易しい", "やや易しい", "ちょうどよい", "やや難しい", "難しい"),
    "workload": ("少ない", "やや少ない", "ちょうどよい", "やや多い", "多い", "課題・制作物はなかった"),
    "class_style": ("講義・説明中心", "個人演習中心", "制作中心", "実演中心", "グループワークあり", "発表あり", "その他"),
}

FIELD_LABELS = {key: str(specification["label"]) for key, specification in FEEDBACK_COLUMNS.items()}

FEEDBACK_SETTINGS = {
    "max_file_bytes": 10 * 1024 * 1024,
    "max_rows": 10_000,
    "min_responses_for_summary": 3,
    "min_responses_for_alert": 3,
    "low_average_alert_threshold": 2.5,
    "low_syllabus_response_threshold": 2,
}

ISSUE_STATUSES = {
    "unreviewed": "未確認",
    "reviewed": "確認済み",
    "resolved": "対応済み",
    "no_action": "対応不要",
}
