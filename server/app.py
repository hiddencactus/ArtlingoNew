from db.mongo import users_collection

def main():
    user = users_collection.find_one()
    print(user)

if __name__ == "__main__":
    main()