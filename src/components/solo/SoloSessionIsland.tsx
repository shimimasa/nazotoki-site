import ErrorBoundary from '../ErrorBoundary';
import SoloSession from './SoloSession';

interface Props {
  data: Parameters<typeof SoloSession>[0]['data'];
  feedbackData: Record<string, unknown> | null;
}

export default function SoloSessionIsland({ data, feedbackData }: Props) {
  return (
    <ErrorBoundary fallbackMessage="ソロモード画面でエラーが発生しました。ページを再読み込みしてください。">
      <SoloSession data={data} feedbackData={feedbackData} />
    </ErrorBoundary>
  );
}
