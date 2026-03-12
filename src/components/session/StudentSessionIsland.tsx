import ErrorBoundary from '../ErrorBoundary';
import StudentSession from './StudentSession';

export default function StudentSessionIsland() {
  return (
    <ErrorBoundary fallbackMessage="セッション画面でエラーが発生しました。ページを再読み込みしてください。">
      <StudentSession />
    </ErrorBoundary>
  );
}
