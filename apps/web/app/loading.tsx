import { LottieLoader } from "../components/loader/LottieLoader";

export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <LottieLoader autoHide={false} />
    </div>
  );
}
