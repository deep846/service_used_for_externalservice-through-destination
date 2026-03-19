const cds = require('@sap/cds');

class studentService extends cds.ApplicationService {
    async init(){

        const {employee,recurringStudent} = this.entities;

        this.on('READ',[employee,recurringStudent], async function(req){

            const cnn = await cds.connect.to('empmanagement');
            return await cnn.run(req.query);
        })

        return super.init();
    }
}

module.exports = {studentService};