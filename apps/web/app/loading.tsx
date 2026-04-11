import { RabbitLoaderScene } from "../components/loader/RabbitLoaderScene";

export default function Loading() {
  return (
    <div className="rabbit-loader-overlay" role="status" aria-live="polite">
      <RabbitLoaderScene />
    </div>
  );
}
