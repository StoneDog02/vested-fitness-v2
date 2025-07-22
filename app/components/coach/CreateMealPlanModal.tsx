import Modal from "~/components/ui/Modal";
import CreateMealPlanForm, {
  MealPlanFormData,
} from "~/components/coach/CreateMealPlanForm";

interface CreateMealPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (mealPlan: MealPlanFormData) => void;
  existingPlan?: MealPlanFormData;
  isLoading?: boolean;
}

export default function CreateMealPlanModal({
  isOpen,
  onClose,
  onSave,
  existingPlan,
  isLoading = false,
}: CreateMealPlanModalProps) {
  const handleSubmit = (data: MealPlanFormData) => {
    if (!isLoading) {
      onSave(data);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isLoading ? () => {} : onClose}
      title={existingPlan ? "Edit Meal Plan" : "Create New Meal Plan"}
      size="xl"
    >
      <div className="relative">
        <CreateMealPlanForm
          onSubmit={handleSubmit}
          onCancel={onClose}
          initialData={existingPlan}
          isLoading={isLoading}
        />
        {isLoading && (
          <div className="absolute inset-0 bg-white/80 dark:bg-night/80 flex items-center justify-center rounded-b-xl">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
              <p className="text-sm text-secondary dark:text-alabaster">Saving meal plan...</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
