using {std as s} from '../db/schema';
using {empmanagement as e} from './external/empmanagement';

service studentService {

    entity student as projection on s.student;
    entity employee as projection on e.Employee;
    entity recurringStudent as projection on e.studentss

}