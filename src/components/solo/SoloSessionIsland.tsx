import ErrorBoundary from '../ErrorBoundary';
import SoloSession from './SoloSession';

interface NextScenario {
  slug: string;
  title: string;
  seriesName: string;
  volume: number;
  subject: string;
  difficulty: string;
}

interface Props {
  data: Parameters<typeof SoloSession>[0]['data'];
  feedbackData: Record<string, unknown> | null;
  nextScenario?: NextScenario | null;
}

export default function SoloSessionIsland({ data, feedbackData, nextScenario = null }: Props) {
  return (
    <ErrorBoundary fallbackMessage="ソロモード画面でエラーが発生しました。ページを再読み込みしてください。">
      <SoloSession data={data} feedbackData={feedbackData} nextScenario={nextScenario} />
    </ErrorBoundary>
  );
}
