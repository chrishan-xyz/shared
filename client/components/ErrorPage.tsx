/**
 * ErrorPage — Full-page error display for 404/500 errors.
 *
 * Uses CSS custom properties from tokens.css. Each app's theme
 * automatically styles this component via --bg-base, --text-primary, etc.
 *
 * Usage:
 *   <ErrorPage code={404} homeHref="/" />
 *   <ErrorPage code={500} title="Server Error" description="Something broke." />
 */

import './ErrorPage.css';

export interface ErrorPageProps {
  /** HTTP status code (404, 500, etc.) */
  code: number;
  /** Main heading — defaults based on code */
  title?: string;
  /** Description text — defaults based on code */
  description?: string;
  /** URL for the "Go Home" button (default: '/') */
  homeHref?: string;
  /** Label for the home button (default: 'Go Home') */
  homeLabel?: string;
  /** Optional extra className */
  className?: string;
}

const DEFAULTS: Record<number, { title: string; description: string }> = {
  404: {
    title: 'Page not found',
    description: "The page you're looking for doesn't exist or has been moved.",
  },
  500: {
    title: 'Something went wrong',
    description: 'An unexpected error occurred. Try refreshing the page.',
  },
};

export default function ErrorPage({
  code,
  title,
  description,
  homeHref = '/',
  homeLabel = 'Go Home',
  className,
}: ErrorPageProps): JSX.Element {
  const defaults = DEFAULTS[code] || DEFAULTS[500]!;

  return (
    <div className={`ep-container ${className || ''}`}>
      <div className="ep-content">
        <span className="ep-code">{code}</span>
        <h1 className="ep-title">{title || defaults.title}</h1>
        <p className="ep-description">{description || defaults.description}</p>
        <div className="ep-actions">
          <a href={homeHref} className="ep-btn-home">
            {homeLabel}
          </a>
        </div>
      </div>
    </div>
  );
}
