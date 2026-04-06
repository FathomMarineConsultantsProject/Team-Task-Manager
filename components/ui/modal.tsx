"use client";

import { X } from "lucide-react";
import { MouseEvent, ReactNode, useEffect, useRef } from "react";
import ModalPortal from "@/components/ModalPortal";

interface ModalProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export default function Modal({ title, isOpen, onClose, children, footer }: ModalProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const stopPropagation = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
          onClick={stopPropagation}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <button
              type="button"
              aria-label="Close modal"
              className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:border-gray-300 hover:bg-gray-50"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>
          <div className="mt-4">{children}</div>
          {footer ? <div className="mt-6 flex flex-wrap justify-end gap-3">{footer}</div> : null}
        </div>
      </div>
    </ModalPortal>
  );
}
