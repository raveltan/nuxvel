import UploadField from "./UploadField.vue";

export default { title: "UploadField", component: UploadField };

export const Default = { args: { name: "post-cover", modelValue: "", label: "Cover image", accept: "image/png,image/jpeg" } };
