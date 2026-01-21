import { useParams } from 'react-router-dom';

export default function PolicyDetail() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="policy-detail">
      <h2>Policy Detail: {id}</h2>
      <p>Policy details and version history will be displayed here</p>
    </div>
  );
}
