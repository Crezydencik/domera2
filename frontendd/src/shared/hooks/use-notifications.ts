"use client";

import { useCallback, type ReactNode } from "react";
import {
  toast,
  type Id,
  type ToastContent,
  type ToastOptions,
  type UpdateOptions,
} from "react-toastify";

type NotificationMessage<TValue = unknown> = ReactNode | ((value: TValue) => ReactNode);

type NotificationPromiseMessages<TData = unknown, TError = unknown> = {
  pending: ReactNode;
  success: NotificationMessage<TData>;
  error: NotificationMessage<TError>;
};

function resolveContent<TValue>(content: NotificationMessage<TValue>, value: TValue): ReactNode {
  return typeof content === "function" ? content(value) : content;
}

export function useNotifications(defaultOptions?: ToastOptions) {
  const withDefaults = useCallback(
    (options?: ToastOptions): ToastOptions | undefined => {
      if (!defaultOptions && !options) {
        return undefined;
      }

      return {
        ...defaultOptions,
        ...options,
      };
    },
    [defaultOptions],
  );

  const notify = useCallback(
    (content: ToastContent, options?: ToastOptions): Id => toast(content, withDefaults(options)),
    [withDefaults],
  );

  const success = useCallback(
    (content: ToastContent, options?: ToastOptions): Id => toast.success(content, withDefaults(options)),
    [withDefaults],
  );

  const error = useCallback(
    (content: ToastContent, options?: ToastOptions): Id => toast.error(content, withDefaults(options)),
    [withDefaults],
  );

  const info = useCallback(
    (content: ToastContent, options?: ToastOptions): Id => toast.info(content, withDefaults(options)),
    [withDefaults],
  );

  const warning = useCallback(
    (content: ToastContent, options?: ToastOptions): Id => toast.warn(content, withDefaults(options)),
    [withDefaults],
  );

  const loading = useCallback(
    (content: ToastContent, options?: ToastOptions): Id => toast.loading(content, withDefaults(options)),
    [withDefaults],
  );

  const dismiss = useCallback((id?: Id) => toast.dismiss(id), []);

  const update = useCallback(
    (id: Id, options: UpdateOptions<unknown>) => toast.update(id, { ...defaultOptions, ...options }),
    [defaultOptions],
  );

  const promise = useCallback(
    async <TData, TError = unknown>(
      promiseLike: Promise<TData>,
      messages: NotificationPromiseMessages<TData, TError>,
      options?: ToastOptions,
    ) => {
      const toastId = loading(resolveContent(messages.pending, undefined as never), options);

      try {
        const result = await promiseLike;

        update(toastId, {
          render: resolveContent(messages.success, result),
          type: "success",
          isLoading: false,
          autoClose: withDefaults(options)?.autoClose ?? 4000,
        });

        return result;
      } catch (caughtError) {
        update(toastId, {
          render: resolveContent(messages.error, caughtError as TError),
          type: "error",
          isLoading: false,
          autoClose: withDefaults(options)?.autoClose ?? 5000,
        });

        throw caughtError;
      }
    },
    [loading, update, withDefaults],
  );

  return {
    notify,
    success,
    error,
    info,
    warning,
    loading,
    promise,
    dismiss,
    update,
  };
}