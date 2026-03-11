import ErrorBoundary from '../ErrorBoundary';
import TeacherAuthGate from './TeacherAuthGate';

interface ScenarioItem {
  slug: string;
  title: string;
  series: string;
  seriesName: string;
  difficulty: string;
}

interface Props {
  scenarios?: ScenarioItem[];
}

export default function DashboardIsland({ scenarios = [] }: Props) {
  return (
    <ErrorBoundary fallbackMessage="ダッシュボードでエラーが発生しました。ページを再読み込みしてください。">
      <TeacherAuthGate scenarios={scenarios} />
    </ErrorBoundary>
  );
}
