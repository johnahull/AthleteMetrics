import { storage } from "./server/storage";

async function updatePassword() {
  try {
    // Find user by username
    const allUsers = await storage.getUsers();
    const user = allUsers.find(u => u.username === "btacoach5");

    if (!user) {
      console.error("User 'btacoach5' not found");
      return;
    }

    console.log("Found user:", {
      id: user.id,
      username: user.username,
      email: user.emails?.[0]
    });

    // Update password
    const newPassword = "Way2good@99?";
    await storage.updateUser(user.id, {
      password: newPassword
    });

    console.log("✅ Password updated successfully for btacoach5");
    console.log("New password:", newPassword);
  } catch (error) {
    console.error("Error updating password:", error);
  } finally {
    process.exit(0);
  }
}

updatePassword();
