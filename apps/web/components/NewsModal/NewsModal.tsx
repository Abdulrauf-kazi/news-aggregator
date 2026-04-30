import React, { useEffect, useMemo, useState } from "react";
import DOMPurify from "isomorphic-dompurify";
import styles from "./NewsModal.module.css";

export type NewsModalItem = {
  id?: string | number;
  title?: string;
  name?: string;
  handle?: string;
  category?: string;
  text?: string;
  source?: string;
  origin?: string;
  platform?: string;
  priority?: string;
  timestamp?: string;
  url?: string;
  score?: number;
};

type ArticlePayload = {
  title?: string;
  byline?: string;
  siteName?: string;
  imageUrl?: string;
  publishedDate?: string;
  readingTime?: number;
  html?: string;
  text?: string;
  finalUrl?: string;
  description?: string;
  author?: string;
};

interface NewsModalProps {
  item: NewsModalItem | null;
  onClose: () => void;
}

const NewsModal: React.FC<NewsModalProps> = ({ item, onClose }) => {
  const [article, setArticle] = useState<ArticlePayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const fetchArticle = async (url: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/fetch-article?url=${encodeURIComponent(url)}`);
        if (!res.ok) {
          throw new Error("Failed to fetch article");
        }
        const data = (await res.json()) as ArticlePayload;
        if (isActive) {
          setArticle(data);
        }
      } catch (err) {
        if (isActive) {
          setError(err instanceof Error ? err.message : "Unable to load article");
          setArticle(null);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    if (item?.url) {
      fetchArticle(item.url);
    } else {
      setArticle(null);
      setError(null);
    }

    return () => {
      isActive = false;
    };
  }, [item?.url]);

  const displayTitle = item?.title || item?.name || "Intel Brief";
  const subtitlePieces = [item?.source || item?.handle, item?.origin || item?.category].filter(Boolean);
  const subtitle = subtitlePieces.join(" • ");
  
  // Use item.text as the primary summary/lead if available, otherwise use article description
  // Fallback to a context-aware description if both are missing
  const leadText = useMemo(() => {
    if (item?.text) return item.text;
    if (article?.description) return article.description;
    if (item?.origin) {
      const host = item.url ? new URL(item.url).hostname.replace(/^www\./, "") : "";
      return `Intelligence signal captured from ${item.origin}${host ? ` via ${host}` : ""}. Full analysis and signal details are being processed.`;
    }
    return "";
  }, [item?.text, item?.origin, item?.url, article?.description]);
  
  const metadataPieces = [
    article?.siteName,
    article?.byline || article?.author,
    article?.publishedDate ? new Date(article.publishedDate).toLocaleDateString() : null,
  ].filter(Boolean);
  const metadata = metadataPieces.join(" • ");
  const readingTime = article?.readingTime ? `${article.readingTime} min read` : null;
  const articleUrl = article?.finalUrl || item?.url;
  const sanitizedHtml = useMemo(() => {
    if (!article?.html) return "";
    return DOMPurify.sanitize(article.html, { USE_PROFILES: { html: true } });
  }, [article?.html]);

  if (!item) {
    return null;
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerText}>
            <div className={styles.topRow}>
              <p className={styles.kicker}>
                {item.origin === "POLYMARKET" ? "Prediction Market" : "Intelligence Report"}
              </p>
              {item.priority && (
                <span className={`${styles.priorityTag} ${styles[item.priority.toLowerCase()]}`}>
                  {item.priority}
                </span>
              )}
              {item.price !== undefined && (
                <span className={styles.priceTag}>
                  Yes: {Math.round(item.price * 100)}%
                </span>
              )}
              {item.volume && (
                <span className={styles.volumeTag}>
                  Vol: {item.volume}
                </span>
              )}
              {item.score && !item.price && (
                <span className={styles.scoreTag}>
                  Score: {item.score}
                </span>
              )}
            </div>
            <h2 className={styles.title}>{displayTitle}</h2>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className={styles.content}>
          {leadText && <p className={styles.lead}>{leadText}</p>}
          
          {(metadata || readingTime) && (
            <div className={styles.metaRow}>
              {metadata && <span className={styles.metaItem}>{metadata}</span>}
              {readingTime && <span className={styles.metaItem}>{readingTime}</span>}
            </div>
          )}

          {article?.imageUrl && (
            <div className={styles.hero}>
              <img src={article.imageUrl} alt="" loading="lazy" />
            </div>
          )}

          <div className={styles.body}>
            {isLoading && (
              <div className={styles.loadingContainer}>
                <div className={styles.spinner}></div>
                <p className={styles.loading}>Analyzing full signal data...</p>
              </div>
            )}
            {error && !leadText && <p className={styles.error}>{error}</p>}
            {!isLoading && sanitizedHtml && (
              <div className={styles.articleHtml} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
            )}
            {!isLoading && !sanitizedHtml && article?.text && (
              <p>{article.text}</p>
            )}
            {!isLoading && !sanitizedHtml && !article?.text && !isLoading && !error && (
              <p className={styles.noContent}>Full article content is not available for this source. Please use the original link below.</p>
            )}
          </div>

          {articleUrl && (
            <a className={styles.sourceLink} href={articleUrl} target="_blank" rel="noopener noreferrer">
              View Original Source
              <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>north_east</span>
            </a>
          )}
        </div>
        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            <span className={styles.source}>
              {[item.origin || item.platform, item.category].filter(Boolean).join(" • ") || "Global Intel"}
            </span>
          </div>
          <span className={styles.timestamp}>
            {item.timestamp ? new Date(item.timestamp).toLocaleString() : ""}
          </span>
        </div>
      </div>
    </div>
  );
};

export default NewsModal;
