from __future__ import annotations

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.config import settings
from app.schemas import ChunkRelevancy, RetrievedChunk


def analyze_chunks(
    question: str,
    chunks: list[RetrievedChunk],
    expected_ins_ids: list[str] | None = None,
) -> tuple[list[ChunkRelevancy], list[str], list[str]]:
    """Score each chunk's relevancy to the question using TF-IDF cosine similarity."""

    if not chunks:
        return [], [], list(expected_ins_ids or [])

    flat_entries: list[dict] = []
    for idx, chunk in enumerate(chunks):
        combined_text = ""
        for cc in chunk.metadata.chunks:
            combined_text += " ".join(cc.content)
        flat_entries.append(
            {
                "index": idx,
                "ins_id": chunk.id,
                "title": chunk.metadata.title,
                "text": combined_text,
            }
        )

    texts = [question] + [e["text"] for e in flat_entries]
    vectorizer = TfidfVectorizer(
        stop_words=settings.tfidf_stop_words,
        max_features=settings.tfidf_max_features,
    )
    tfidf_matrix = vectorizer.fit_transform(texts)

    question_vec = tfidf_matrix[0:1]
    chunk_vecs = tfidf_matrix[1:]
    similarities = cosine_similarity(question_vec, chunk_vecs)[0]

    results: list[ChunkRelevancy] = []
    found_ids: set[str] = set()
    for i, entry in enumerate(flat_entries):
        preview = entry["text"][:settings.content_preview_length] if entry["text"] else ""
        results.append(
            ChunkRelevancy(
                chunk_index=entry["index"],
                ins_id=entry["ins_id"],
                document_title=entry["title"],
                relevancy_score=round(float(similarities[i]), 4),
                content_preview=preview,
            )
        )
        found_ids.add(entry["ins_id"])

    results.sort(key=lambda r: r.relevancy_score, reverse=True)

    expected = set(expected_ins_ids or [])
    found = expected & found_ids
    missing = expected - found_ids

    return results, list(found), list(missing)
