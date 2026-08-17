import uuid
from datetime import datetime, timezone
from typing import List
from service.models import BlockModel, TestQuestionModel

def generate_draft_questions_from_blocks(blocks: List[BlockModel]) -> List[TestQuestionModel]:
    """
    Generates synthetic evaluation questions grounded directly in block passages.
    Every generated question is returned with status='draft' and linked to its source block.
    """
    drafts: List[TestQuestionModel] = []
    now_iso = datetime.now(timezone.utc).isoformat()

    for block in blocks:
        content = block.content.strip()
        if len(content) < 15:
            continue

        first_line = content.split("\n")[0][:80]
        
        if block.type == "heading":
            question_text = f"What is detailed in the section '{first_line}'?"
        elif block.type == "code":
            lang = block.attributes.codeLanguage if block.attributes and block.attributes.codeLanguage else "code"
            question_text = f"How is the {lang} snippet implemented?"
        elif block.type == "table":
            headers = ", ".join(block.attributes.tableHeaders) if block.attributes and block.attributes.tableHeaders else "data"
            question_text = f"What values are tabulated under {headers}?"
        else:
            words = content.split()
            sample_phrase = " ".join(words[:min(6, len(words))])
            question_text = f"Where does the passage mention '{sample_phrase}'?"

        drafts.append(
            TestQuestionModel(
                id=f"draft_{uuid.uuid4().hex[:8]}",
                query=question_text,
                expectedBlockId=block.id,
                generatedFromBlockId=block.id,
                notes=f"Auto-generated draft from block {block.id} ({block.type})",
                status="draft",
                createdAt=now_iso,
                updatedAt=now_iso
            )
        )

    return drafts
