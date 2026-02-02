# MongoDB Seeding

Data under the `/data` folder is loaded into MongoDB upon container startup.

Data is loaded via the INSERT strategy, which means:
* New documents that do not have a conflict for an unique field (ex. `_id`) with an existing document are inserted
* New documents that do have a conflict for an unique field are not inserted
* Existing documents are not modified

## Notable Data Properties

* All user passwords are `testpw123`
