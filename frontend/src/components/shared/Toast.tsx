import { Toaster, toast as _toast } from "react-hot-toast";
export const toast = (msg: string, isError = false) => {
  if (isError) _toast.error(msg, { duration: 4000 });
  else _toast.success(msg, { duration: 3000 });
};
export function ToastProvider() {
  return <Toaster position="bottom-right" toastOptions={{
    style: { fontFamily: "Inter, sans-serif", fontSize: "14px", borderRadius: "8px", background: "#fff", color: "#111827", border: "1px solid #E5E7EB", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" },
  }} />;
}
