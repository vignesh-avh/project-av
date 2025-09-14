from app.db import users_collection

def clean_null_uid():
    result = users_collection.delete_many({"uid": None})
    print(f"Deleted {result.deleted_count} documents with null UID")

if __name__ == "__main__":
    clean_null_uid()