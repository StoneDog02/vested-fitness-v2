import Modal from "~/components/ui/Modal";
import CreateMealPlanForm, {
  MealPlanFormData,
} from "~/components/coach/CreateMealPlanForm";

interface CreateMealPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (mealPlan: MealPlanFormData) => void;
}

export default function CreateMealPlanModal({
  isOpen,
  onClose,
  onSave,
}: CreateMealPlanModalProps) {
  const handleSubmit = (data: MealPlanFormData) => {
    onSave(data);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Meal Plan"
      size="xl"
    >
      <CreateMealPlanForm onSubmit={handleSubmit} onCancel={onClose} />
    </Modal>
  );
}
