// Styled in-page confirmation dialog.
import { h } from "./util.js";

export const createDialog = function (shadow) {
  const message = h("p", { class: "ma-dialog-msg" });
  const dialog = h("dialog", { class: "ma-dialog", "aria-label": "Confirm" },
    message,
    h("form", { method: "dialog", class: "ma-dialog-actions" },
      h("button", { value: "cancel", class: "ma-btn" }, "Cancel"),
      h("button", { value: "delete", class: "ma-btn ma-btn-danger" }, "Delete"),
    ),
  );
  shadow.append(dialog);

  return {
    /** Resolves true if the reader chose Delete. */
    confirm(text) {
      message.textContent = text;
      dialog.returnValue = "";
      dialog.showModal();
      return new Promise((resolve) => {
        dialog.addEventListener("close", () => resolve(dialog.returnValue === "delete"), { once: true });
      });
    },
  };
};
