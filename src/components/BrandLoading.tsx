import './BrandLoading.css';

type BrandLoadingProps = {
  label?: string;
};

export default function BrandLoading({ label = '正在打开简艺装工作台' }: BrandLoadingProps) {
  return (
    <div className="brand-loading" role="status" aria-live="polite" aria-label={label}>
      <div className="brand-loading-mark" aria-hidden="true"><span /></div>
      <div className="brand-loading-copy">
        <strong>简艺装</strong>
        <span>{label}</span>
      </div>
      <div className="brand-loading-track" aria-hidden="true"><i /><i /><i /></div>
    </div>
  );
}
