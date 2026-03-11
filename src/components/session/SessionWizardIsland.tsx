import ErrorBoundary from '../ErrorBoundary';
import SessionWizard from './SessionWizard';

interface Props {
  data: Parameters<typeof SessionWizard>[0]['data'];
  siteUrl: string;
}

export default function SessionWizardIsland({ data, siteUrl }: Props) {
  return (
    <ErrorBoundary fallbackMessage="セッション画面でエラーが発生しました。ページを再読み込みしてください。">
      <SessionWizard data={data} siteUrl={siteUrl} />
    </ErrorBoundary>
  );
}
