export interface PageStateProps {
  data: Record<string, unknown>;
}

/**
 * PageState — renders a hidden JSON block with the full page state.
 * Agents can read this instantly: document.getElementById('page-state').textContent
 */
export default function PageState({ data }: PageStateProps): JSX.Element {
  return (
    <script
      id="page-state"
      type="application/json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
